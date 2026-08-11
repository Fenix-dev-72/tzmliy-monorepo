"""Platform Admin dashboard's revenue-trend chart + top-tenants ranking
(2026-08-11): cross-tenant bucketed revenue for the new /platform/dashboard
trend card, and a top-N tenants-by-revenue list. Exercises
platform_dashboard.service.get_revenue_analytics directly.
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
    await owner_conn.execute("DELETE FROM billing_plans WHERE code LIKE 'test-rev-plan-%'")


async def _insert_plan(owner_conn) -> str:
    return await owner_conn.fetchval(
        """
        INSERT INTO billing_plans (code, name, price_amount, currency, max_users, max_billable_storage_bytes)
        VALUES ($1, 'Test Rev Plan', 100000, 'UZS', 5, 1000000000) RETURNING id
        """,
        f"test-rev-plan-{uuid4().hex[:8]}",
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


async def test_week_buckets_are_gap_filled_and_totals_match(app_pool, owner_conn, two_tenants):
    tenant_a, tenant_b = two_tenants
    plan_id = await _insert_plan(owner_conn)
    sub_a = await _insert_subscription(owner_conn, tenant_a, plan_id)
    sub_b = await _insert_subscription(owner_conn, tenant_b, plan_id)

    await _insert_payment(owner_conn, tenant_a, sub_a, plan_id, amount=200_000, performed_at_offset=timedelta(days=-2))
    await _insert_payment(owner_conn, tenant_b, sub_b, plan_id, amount=50_000, performed_at_offset=timedelta(days=-2))
    # Outside the 7-day window -- must not affect the "week" totals.
    await _insert_payment(owner_conn, tenant_a, sub_a, plan_id, amount=999_999, performed_at_offset=timedelta(days=-40))

    result = await service.get_revenue_analytics(app_pool, "week")

    assert len(result["buckets"]) >= 7  # 7 daily buckets * >=1 currency, gap-filled
    total_uzs = sum(b["total_amount"] for b in result["buckets"] if b["currency"] == "UZS")
    assert total_uzs == 250_000

    top = result["top_tenants"]
    assert top[0]["total_amount"] == 200_000
    assert top[0]["tenant_id"] == tenant_a
    assert top[1]["total_amount"] == 50_000


async def test_year_period_buckets_by_month(app_pool, owner_conn, two_tenants):
    tenant_a, _ = two_tenants
    plan_id = await _insert_plan(owner_conn)
    sub_a = await _insert_subscription(owner_conn, tenant_a, plan_id)
    await _insert_payment(owner_conn, tenant_a, sub_a, plan_id, amount=75_000, performed_at_offset=timedelta(days=-1))

    result = await service.get_revenue_analytics(app_pool, "year")

    assert len(result["buckets"]) == 12  # one per calendar month
    total = sum(b["total_amount"] for b in result["buckets"])
    assert total == 75_000
