"""In-app notification inbox (2026-08-10): the bell icon's real data source.
Three producers feed it -- complaint replies, Platform Admin broadcasts, and
the daily payment-due-warning task -- all funneled through
notifications/inbox_service.py's notify_user/notify_users. Exercises each
producer plus the inbox read/unread API itself.
"""

from datetime import timedelta
from uuid import uuid4

import pytest

from app.modules.billing import repository as billing_repository
from app.modules.billing.tasks import _send_payment_due_warnings
from app.modules.complaints import service as complaints_service
from app.modules.notifications import inbox_service


async def _insert_platform_admin(owner_conn, *, totp_enabled: bool) -> str:
    return await owner_conn.fetchval(
        "INSERT INTO platform_admins (email, password_hash, totp_enabled) VALUES ($1, 'x', $2) RETURNING id",
        f"inbox-test-{uuid4()}@example.com",
        totp_enabled,
    )


async def _insert_role_user(owner_conn, tenant_id, role_name: str) -> str:
    role_id = await owner_conn.fetchval(
        "INSERT INTO roles (tenant_id, name) VALUES ($1, $2) RETURNING id", tenant_id, role_name
    )
    return await owner_conn.fetchval(
        "INSERT INTO users (tenant_id, email, password_hash, role_id) VALUES ($1, $2, $3, $4) RETURNING id",
        tenant_id,
        f"inbox-test-{uuid4().hex}@example.test",
        "not-a-real-hash",
        role_id,
    )


@pytest.fixture(autouse=True)
async def _cleanup(owner_conn, two_tenants):
    yield
    ids = list(two_tenants)
    await owner_conn.execute("DELETE FROM user_notifications WHERE tenant_id = ANY($1::uuid[])", ids)
    await owner_conn.execute("DELETE FROM complaints WHERE tenant_id = ANY($1::uuid[])", ids)
    await owner_conn.execute("DELETE FROM tenant_subscriptions WHERE tenant_id = ANY($1::uuid[])", ids)
    await owner_conn.execute("DELETE FROM billing_plans WHERE code LIKE 'test-inbox-plan-%'")


# --- inbox read/unread ------------------------------------------------------


async def test_inbox_unread_count_and_mark_read(app_pool, owner_conn, two_tenants):
    tenant_a, _ = two_tenants
    user_id = await _insert_role_user(owner_conn, tenant_a, "agent")
    await inbox_service.notify_user(app_pool, tenant_a, user_id, "broadcast", "Sarlavha 1", "Matn 1")
    await inbox_service.notify_user(app_pool, tenant_a, user_id, "broadcast", "Sarlavha 2", "Matn 2")

    assert await inbox_service.count_unread(app_pool, tenant_a, user_id) == 2

    inbox = await inbox_service.list_inbox(app_pool, tenant_a, user_id)
    assert len(inbox) == 2
    await inbox_service.mark_read(app_pool, tenant_a, user_id, inbox[0]["id"])
    assert await inbox_service.count_unread(app_pool, tenant_a, user_id) == 1

    await inbox_service.mark_all_read(app_pool, tenant_a, user_id)
    assert await inbox_service.count_unread(app_pool, tenant_a, user_id) == 0


# --- complaint reply ---------------------------------------------------------


async def test_complaint_reply_notifies_submitter_and_advances_status(app_pool, owner_conn, two_tenants):
    tenant_a, _ = two_tenants
    submitter_id = await _insert_role_user(owner_conn, tenant_a, "agent")
    admin_id = await _insert_platform_admin(owner_conn, totp_enabled=True)

    complaint = await complaints_service.create_complaint(
        app_pool, tenant_a, submitter_id, "Yordam kerak", "Tizim ishlamayapti"
    )
    assert complaint["status"] == "open"

    updated = await complaints_service.reply_to_complaint(app_pool, complaint["id"], admin_id, "Muammo hal qilindi")
    assert updated["status"] == "in_progress"
    assert updated["admin_reply"] == "Muammo hal qilindi"
    assert updated["replied_by_admin_id"] == admin_id

    inbox = await inbox_service.list_inbox(app_pool, tenant_a, submitter_id)
    assert len(inbox) == 1
    assert inbox[0]["type"] == "support_reply"
    assert inbox[0]["link"] == "/dashboard/support"

    my_complaints = await complaints_service.list_my_complaints(app_pool, tenant_a, submitter_id)
    assert len(my_complaints) == 1
    assert my_complaints[0]["admin_reply"] == "Muammo hal qilindi"


async def test_complaint_reply_does_not_downgrade_resolved(app_pool, owner_conn, two_tenants):
    tenant_a, _ = two_tenants
    submitter_id = await _insert_role_user(owner_conn, tenant_a, "agent")
    admin_id = await _insert_platform_admin(owner_conn, totp_enabled=True)

    complaint = await complaints_service.create_complaint(app_pool, tenant_a, submitter_id, "S", "M")
    await complaints_service.update_complaint_status(app_pool, complaint["id"], "resolved", admin_id)

    updated = await complaints_service.reply_to_complaint(app_pool, complaint["id"], admin_id, "Qo'shimcha izoh")
    assert updated["status"] == "resolved"


# --- broadcast ---------------------------------------------------------------


async def test_broadcast_requires_2fa(app_pool, owner_conn):
    admin_id = await _insert_platform_admin(owner_conn, totp_enabled=False)
    with pytest.raises(inbox_service.TwoFactorRequiredError):
        await inbox_service.broadcast_notification(
            app_pool, _fake_settings(), admin_id, "all", None, "Sarlavha", "Matn", "test"
        )


async def test_broadcast_all_reaches_only_admin_role(app_pool, owner_conn, two_tenants):
    tenant_a, tenant_b = two_tenants
    admin_user_a = await _insert_role_user(owner_conn, tenant_a, "admin")
    agent_user_a = await _insert_role_user(owner_conn, tenant_a, "agent")
    admin_user_b = await _insert_role_user(owner_conn, tenant_b, "admin")
    platform_admin_id = await _insert_platform_admin(owner_conn, totp_enabled=True)

    result = await inbox_service.broadcast_notification(
        app_pool, _fake_settings(), platform_admin_id, "all", None, "E'lon", "Barchaga xabar", "test broadcast"
    )
    assert result["tenants_reached"] >= 2
    assert result["admins_notified"] >= 2

    assert len(await inbox_service.list_inbox(app_pool, tenant_a, admin_user_a)) == 1
    assert len(await inbox_service.list_inbox(app_pool, tenant_a, agent_user_a)) == 0
    assert len(await inbox_service.list_inbox(app_pool, tenant_b, admin_user_b)) == 1


async def test_broadcast_plan_filters_by_subscription(app_pool, owner_conn, two_tenants):
    tenant_a, tenant_b = two_tenants
    admin_user_a = await _insert_role_user(owner_conn, tenant_a, "admin")
    admin_user_b = await _insert_role_user(owner_conn, tenant_b, "admin")
    platform_admin_id = await _insert_platform_admin(owner_conn, totp_enabled=True)

    plan_id = await owner_conn.fetchval(
        """
        INSERT INTO billing_plans (code, name, price_amount, currency, max_users, max_billable_storage_bytes)
        VALUES ($1, 'Test Inbox Plan', 100000, 'UZS', 5, 1000000000) RETURNING id
        """,
        f"test-inbox-plan-{uuid4().hex[:8]}",
    )
    await owner_conn.execute(
        """
        INSERT INTO tenant_subscriptions (tenant_id, billing_plan_id, current_period_start, current_period_end)
        VALUES ($1, $2, now(), now() + interval '30 days')
        """,
        tenant_a,
        plan_id,
    )
    # tenant_b has no subscription on this plan at all.

    await inbox_service.broadcast_notification(
        app_pool, _fake_settings(), platform_admin_id, "plan", plan_id, "Reja e'loni", "Faqat shu reja", "test"
    )

    assert len(await inbox_service.list_inbox(app_pool, tenant_a, admin_user_a)) == 1
    assert len(await inbox_service.list_inbox(app_pool, tenant_b, admin_user_b)) == 0


# --- automatic payment-due warning -------------------------------------------


async def test_payment_due_warning_fires_within_2_days_and_not_twice(app_pool, owner_conn, two_tenants, monkeypatch):
    tenant_a, tenant_b = two_tenants
    admin_user_a = await _insert_role_user(owner_conn, tenant_a, "admin")
    await _insert_role_user(owner_conn, tenant_b, "admin")  # tenant_b stays out of the warning window

    plan_id = await owner_conn.fetchval(
        """
        INSERT INTO billing_plans (code, name, price_amount, currency, max_users, max_billable_storage_bytes)
        VALUES ($1, 'Test Inbox Plan', 100000, 'UZS', 5, 1000000000) RETURNING id
        """,
        f"test-inbox-plan-{uuid4().hex[:8]}",
    )
    # tenant_a: due in 1 day (inside the 2-day warning window).
    await owner_conn.execute(
        """
        INSERT INTO tenant_subscriptions (tenant_id, billing_plan_id, current_period_start, current_period_end)
        VALUES ($1, $2, now() - interval '29 days', now() + interval '1 day')
        """,
        tenant_a,
        plan_id,
    )
    # tenant_b: due in 10 days (outside the window) -- must not be warned.
    await owner_conn.execute(
        """
        INSERT INTO tenant_subscriptions (tenant_id, billing_plan_id, current_period_start, current_period_end)
        VALUES ($1, $2, now(), now() + interval '10 days')
        """,
        tenant_b,
        plan_id,
    )

    monkeypatch.setattr("app.modules.billing.tasks.get_pool", lambda: app_pool)

    await _send_payment_due_warnings()

    assert len(await inbox_service.list_inbox(app_pool, tenant_a, admin_user_a)) == 1
    sub_a = await _get_subscription(app_pool, tenant_a)
    assert sub_a["payment_due_warning_sent_at"] is not None

    # Running again must not send a second notification for the same period.
    await _send_payment_due_warnings()
    assert len(await inbox_service.list_inbox(app_pool, tenant_a, admin_user_a)) == 1


async def _get_subscription(pool, tenant_id):
    from app.core.database import tenant_connection

    async with tenant_connection(pool, tenant_id) as conn:
        return await billing_repository.get_tenant_subscription(conn, tenant_id)


def _fake_settings():
    from app.core.config import get_settings

    return get_settings()
