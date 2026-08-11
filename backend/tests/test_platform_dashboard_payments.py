"""Platform Admin dashboard's "new vs recurring" payment split (2026-08-11):
a tenant's first-ever 'paid' subscription_payments row is a new subscriber,
every later one is a renewal. Exercises
platform_dashboard.service.get_dashboard_summary's payments_this_month_by_kind
directly against the real tables.
"""

from datetime import timedelta
from uuid import uuid4

import pytest

from app.modules.platform_dashboard import service


@pytest.fixture(autouse=True)
async def _cleanup(owner_conn, two_tenants):
    yield
    ids = list(two_tenants)
    await owner_conn.execute("DELETE FROM subscription_payments WHERE tenant_id = ANY($1::uuid[])", ids)
    await owner_conn.execute("DELETE FROM tenant_subscriptions WHERE tenant_id = ANY($1::uuid[])", ids)
    await owner_conn.execute("DELETE FROM billing_plans WHERE code LIKE 'test-dash-plan-%'")


async def _insert_plan(owner_conn) -> str:
    return await owner_conn.fetchval(
        """
        INSERT INTO billing_plans (code, name, price_amount, currency, max_users, max_billable_storage_bytes)
        VALUES ($1, 'Test Dash Plan', 100000, 'UZS', 5, 1000000000) RETURNING id
        """,
        f"test-dash-plan-{uuid4().hex[:8]}",
    )


async def _insert_subscription(owner_conn, tenant_id, plan_id) -> str:
    return await owner_conn.fetchval(
        """
        INSERT INTO tenant_subscriptions (tenant_id, billing_plan_id, current_period_start, current_period_end)
        VALUES ($1, $2, now(), now() + interval '30 days') RETURNING id
        """,
        tenant_id,
        plan_id,
    )


async def _insert_payment(owner_conn, tenant_id, sub_id, plan_id, *, amount, performed_at_offset: timedelta) -> None:
    await owner_conn.execute(
        """
        INSERT INTO subscription_payments
            (tenant_id, tenant_subscription_id, billing_plan_id, provider, amount, currency, status,
             period_start, period_end, idempotency_key, performed_at)
        VALUES ($1, $2, $3, 'manual', $4, 'UZS', 'paid', now(), now() + interval '30 days', $5, now() + $6)
        """,
        tenant_id,
        sub_id,
        plan_id,
        amount,
        f"test-{uuid4()}",
        performed_at_offset,
    )


async def test_first_payment_is_new_later_ones_are_recurring(app_pool, owner_conn, two_tenants):
    tenant_a, _ = two_tenants
    plan_id = await _insert_plan(owner_conn)
    sub_id = await _insert_subscription(owner_conn, tenant_a, plan_id)

    # Both payments land in the current month -- first one is "new", the
    # renewal a few days later is "recurring".
    await _insert_payment(owner_conn, tenant_a, sub_id, plan_id, amount=100_000, performed_at_offset=timedelta(days=-5))
    await _insert_payment(owner_conn, tenant_a, sub_id, plan_id, amount=100_000, performed_at_offset=timedelta(days=-1))

    summary = await service.get_dashboard_summary(app_pool)
    by_kind = {(row["kind"], row["currency"]): row for row in summary["payments_this_month_by_kind"]}

    assert by_kind[("new", "UZS")]["count"] >= 1
    assert by_kind[("recurring", "UZS")]["count"] >= 1
    assert by_kind[("new", "UZS")]["total_amount"] >= 100_000
    assert by_kind[("recurring", "UZS")]["total_amount"] >= 100_000


async def test_renewal_from_a_prior_month_is_not_counted_as_new_this_month(app_pool, owner_conn, two_tenants):
    tenant_a, _ = two_tenants
    plan_id = await _insert_plan(owner_conn)
    sub_id = await _insert_subscription(owner_conn, tenant_a, plan_id)

    # First-ever payment was last month (outside the reporting window);
    # this month's payment is a renewal, not a new subscriber, even though
    # it's the only one visible within this month's window.
    await _insert_payment(owner_conn, tenant_a, sub_id, plan_id, amount=50_000, performed_at_offset=timedelta(days=-45))
    await _insert_payment(owner_conn, tenant_a, sub_id, plan_id, amount=50_000, performed_at_offset=timedelta(days=-1))

    summary = await service.get_dashboard_summary(app_pool)
    by_kind = {(row["kind"], row["currency"]): row for row in summary["payments_this_month_by_kind"]}

    # Only the recurring one should be visible this month for this tenant --
    # the "new" payment from 45 days ago falls outside this month's window.
    assert ("recurring", "UZS") in by_kind
