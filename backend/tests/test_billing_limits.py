"""Plan-based limits added on top of the billing-plans CRUD (2026-08-09):
a real trial billing_plans row assigned automatically at tenant creation,
max_users enforcement on employee creation, feature-key gating
(get_entitlements), and storage-limit blocking (enforce_storage_not_exceeded).
"""

from uuid import uuid4

import pytest

from app.modules.auth import users_service
from app.modules.billing import service as billing_service


async def _insert_plan(owner_conn, *, max_users: int, feature_keys: list[str], code: str | None = None) -> dict:
    code = code or f"test-limit-plan-{uuid4().hex[:8]}"
    row = await owner_conn.fetchrow(
        """
        INSERT INTO billing_plans (code, name, price_amount, currency, max_users, max_billable_storage_bytes, feature_keys)
        VALUES ($1, 'Test Plan', 100000, 'UZS', $2, 1000000000, $3::text[])
        RETURNING id, code
        """,
        code,
        max_users,
        feature_keys,
    )
    return dict(row)


async def _insert_subscription(owner_conn, tenant_id, billing_plan_id) -> None:
    await owner_conn.execute(
        """
        INSERT INTO tenant_subscriptions (tenant_id, billing_plan_id, current_period_start, current_period_end)
        VALUES ($1, $2, now(), now() + interval '30 days')
        """,
        tenant_id,
        billing_plan_id,
    )


async def _insert_snapshot(owner_conn, tenant_id, *, usage_ratio_bps: int) -> None:
    await owner_conn.execute(
        """
        INSERT INTO storage_usage_snapshots
            (tenant_id, db_bytes, object_storage_bytes, total_bytes, billable_storage_limit_bytes, usage_ratio_bps)
        VALUES ($1, 1, 1, 2, 1000000000, $2)
        ON CONFLICT (tenant_id, snapshot_date) DO UPDATE SET usage_ratio_bps = EXCLUDED.usage_ratio_bps
        """,
        tenant_id,
        usage_ratio_bps,
    )


@pytest.fixture(autouse=True)
async def _cleanup_test_plans(owner_conn, two_tenants):
    """Depends on two_tenants so this fixture's teardown (LIFO) runs BEFORE
    two_tenants' own teardown deletes the tenants row -- tenant_subscriptions/
    storage_usage_snapshots this test creates must be cleared first, or
    two_tenants' final `DELETE FROM tenants` 500s on the FK."""
    yield
    tenant_ids = list(two_tenants)
    await owner_conn.execute("DELETE FROM tenant_subscriptions WHERE tenant_id = ANY($1::uuid[])", tenant_ids)
    await owner_conn.execute("DELETE FROM storage_usage_snapshots WHERE tenant_id = ANY($1::uuid[])", tenant_ids)
    await owner_conn.execute("DELETE FROM billing_plans WHERE code LIKE 'test-limit-plan-%'")


async def test_assign_trial_subscription_creates_subscription(app_pool, owner_conn, two_tenants):
    tenant_a, _ = two_tenants
    result = await billing_service.assign_trial_subscription(app_pool, tenant_a)
    assert result is not None
    assert result["trial_ends_at"] is not None

    row = await owner_conn.fetchrow("SELECT billing_plan_id FROM tenant_subscriptions WHERE tenant_id = $1", tenant_a)
    plan_code = await owner_conn.fetchval("SELECT code FROM billing_plans WHERE id = $1", row["billing_plan_id"])
    assert plan_code == "trial"


async def test_create_user_blocked_at_max_users(app_pool, owner_conn, two_tenants):
    tenant_a, _ = two_tenants
    plan = await _insert_plan(owner_conn, max_users=1, feature_keys=[])
    await _insert_subscription(owner_conn, tenant_a, plan["id"])

    role_id = await owner_conn.fetchval("INSERT INTO roles (tenant_id, name) VALUES ($1, 'employee') RETURNING id", tenant_a)

    # First user succeeds -- brings active count to 1, matching max_users.
    await users_service.create_user(app_pool, tenant_a, f"emp1-{uuid4().hex}@example.com", "Sup3rSecret!", role_id)

    with pytest.raises(users_service.UserLimitReachedError) as exc_info:
        await users_service.create_user(app_pool, tenant_a, f"emp2-{uuid4().hex}@example.com", "Sup3rSecret!", role_id)
    assert exc_info.value.max_users == 1


async def test_get_entitlements_no_subscription_is_empty(app_pool, two_tenants):
    _, tenant_b = two_tenants
    entitlements = await billing_service.get_entitlements(app_pool, tenant_b)
    assert entitlements["plan_code"] is None
    assert entitlements["feature_keys"] == []


async def test_get_entitlements_reflects_plan_feature_keys(app_pool, owner_conn, two_tenants):
    tenant_a, _ = two_tenants
    plan = await _insert_plan(owner_conn, max_users=10, feature_keys=["crm_integrations", "advanced_reports"])
    await _insert_subscription(owner_conn, tenant_a, plan["id"])

    entitlements = await billing_service.get_entitlements(app_pool, tenant_a)
    assert entitlements["plan_code"] == plan["code"]
    assert set(entitlements["feature_keys"]) == {"crm_integrations", "advanced_reports"}


async def test_enforce_storage_not_exceeded_blocks_at_limit(app_pool, owner_conn, two_tenants):
    tenant_a, _ = two_tenants
    await _insert_snapshot(owner_conn, tenant_a, usage_ratio_bps=10000)

    with pytest.raises(billing_service.StorageLimitExceededError):
        await billing_service.enforce_storage_not_exceeded(app_pool, tenant_a)


async def test_enforce_storage_not_exceeded_allows_under_limit(app_pool, owner_conn, two_tenants):
    tenant_a, _ = two_tenants
    await _insert_snapshot(owner_conn, tenant_a, usage_ratio_bps=5000)

    await billing_service.enforce_storage_not_exceeded(app_pool, tenant_a)  # should not raise


async def test_enforce_storage_not_exceeded_allows_with_no_snapshot(app_pool, two_tenants):
    _, tenant_b = two_tenants
    await billing_service.enforce_storage_not_exceeded(app_pool, tenant_b)  # should not raise
