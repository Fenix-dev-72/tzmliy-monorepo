"""Billing-plan CRUD: platform admins can now create arbitrary new plans
(not just edit the three seeded ones), gated by the same 2FA+audit pattern
as every other privileged Platform Admin action, plus the unauthenticated
public listing the landing page reads from.
"""

from uuid import uuid4

import pytest

from app.modules.billing import service


async def _insert_platform_admin(owner_conn, *, totp_enabled: bool) -> str:
    admin_id = await owner_conn.fetchval(
        """
        INSERT INTO platform_admins (email, password_hash, totp_enabled)
        VALUES ($1, 'x', $2)
        RETURNING id
        """,
        f"billing-plan-test-{uuid4()}@example.com",
        totp_enabled,
    )
    return admin_id


def _plan_code() -> str:
    return f"test-plan-{uuid4().hex[:8]}"


@pytest.fixture(autouse=True)
async def _cleanup_test_plans(owner_conn):
    yield
    await owner_conn.execute("DELETE FROM billing_plans WHERE code LIKE 'test-plan-%'")


async def test_create_billing_plan_requires_2fa(app_pool, owner_conn):
    admin_id = await _insert_platform_admin(owner_conn, totp_enabled=False)
    with pytest.raises(service.TwoFactorRequiredError):
        await service.create_billing_plan(
            app_pool,
            admin_id,
            _plan_code(),
            "Test Plan",
            100000,
            "UZS",
            1,
            5,
            1_000_000_000,
            ["feature uz"],
            ["feature ru"],
            [],
            False,
            True,
            False,
            None,
            "test create",
        )


async def test_create_billing_plan_success_persists_and_audits(app_pool, owner_conn):
    admin_id = await _insert_platform_admin(owner_conn, totp_enabled=True)
    code = _plan_code()

    created = await service.create_billing_plan(
        app_pool,
        admin_id,
        code,
        "Test Plan",
        250000,
        "UZS",
        1,
        10,
        2_000_000_000,
        ["birinchi", "ikkinchi"],
        ["первое", "второе"],
        [],
        True,
        True,
        False,
        None,
        "new plan for pilot customer",
    )
    assert created["code"] == code
    assert created["is_popular"] is True
    assert created["features_uz"] == ["birinchi", "ikkinchi"]

    plans = await service.list_billing_plans(app_pool)
    assert any(p["code"] == code for p in plans)

    audit_row = await owner_conn.fetchrow(
        "SELECT action, reason, tenant_id FROM audit_logs WHERE actor_id = $1 AND action = 'create_billing_plan'",
        admin_id,
    )
    assert audit_row is not None
    assert audit_row["reason"] == "new plan for pilot customer"
    assert audit_row["tenant_id"] is None


async def test_create_billing_plan_duplicate_code_raises(app_pool, owner_conn):
    admin_id = await _insert_platform_admin(owner_conn, totp_enabled=True)
    code = _plan_code()

    async def _create():
        return await service.create_billing_plan(
            app_pool,
            admin_id,
            code,
            "Test Plan",
            100000,
            "UZS",
            1,
            5,
            1_000_000_000,
            [],
            [],
            [],
            False,
            True,
            False,
            None,
            "first create",
        )

    await _create()
    with pytest.raises(service.PlanCodeTakenError):
        await _create()


async def test_list_public_billing_plans_excludes_inactive(app_pool, owner_conn):
    admin_id = await _insert_platform_admin(owner_conn, totp_enabled=True)
    active_code = _plan_code()
    inactive_code = _plan_code()

    await service.create_billing_plan(
        app_pool, admin_id, active_code, "Active Plan", 100000, "UZS", 1, 5, 1_000_000_000, [], [], [], False, True, False, None, "r"
    )
    await service.create_billing_plan(
        app_pool, admin_id, inactive_code, "Inactive Plan", 100000, "UZS", 1, 5, 1_000_000_000, [], [], [], False, False, False, None, "r"
    )

    public_plans = await service.list_public_billing_plans(app_pool)
    codes = [p["code"] for p in public_plans]
    assert active_code in codes
    assert inactive_code not in codes
    # Public schema must not leak internal-only fields.
    assert "is_active" not in public_plans[0]
    assert "id" not in public_plans[0]
