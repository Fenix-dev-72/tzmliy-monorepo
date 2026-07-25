"""Warehouse statistics (owner request: total stock, most-overstocked, and
slowest-moving products). Seeds products with different stock levels and sales
at different dates, then asserts the aggregation, ordering, and never-sold
handling. Drives the real products service against a live DB.
"""

from datetime import datetime, timedelta, timezone

from app.modules.products import service as products_service

_DEADLINE = datetime(2026, 12, 31, tzinfo=timezone.utc)


async def _product(owner_conn, tenant_id, cat, name, stock, sell):
    return await owner_conn.fetchval(
        "INSERT INTO products (tenant_id, category_id, name, cost_price_amount, cost_price_currency, "
        "sell_price_amount, sell_price_currency, stock_quantity) VALUES ($1, $2, $3, 500, 'UZS', $4, 'UZS', $5) "
        "RETURNING id",
        tenant_id,
        cat,
        name,
        sell,
        stock,
    )


async def _sale_at(owner_conn, tenant_id, customer, user, product_id, when, key):
    await owner_conn.execute(
        "INSERT INTO sales (tenant_id, customer_id, responsible_user_id, currency, price_amount, deadline, "
        "idempotency_key, product_id, quantity, created_at) VALUES ($1, $2, $3, 'UZS', 1000, $4, $5, $6, 1, $7)",
        tenant_id,
        customer,
        user,
        _DEADLINE,
        key,
        product_id,
        when,
    )


async def test_warehouse_stats(app_pool, owner_conn, two_tenants, tenant_users):
    tenant_a, _ = two_tenants
    user = tenant_users[tenant_a]
    cat = await owner_conn.fetchval(
        "INSERT INTO catalog_categories (tenant_id, name) VALUES ($1, $2) RETURNING id", tenant_a, "wh-cat"
    )
    customer = await owner_conn.fetchval(
        "INSERT INTO customers (tenant_id, full_name) VALUES ($1, $2) RETURNING id", tenant_a, "cust"
    )
    now = datetime.now(timezone.utc)
    await _product(owner_conn, tenant_a, cat, "A-recent", stock=100, sell=10)
    a_recent = await owner_conn.fetchval("SELECT id FROM products WHERE tenant_id=$1 AND name='A-recent'", tenant_a)
    await _product(owner_conn, tenant_a, cat, "B-never", stock=50, sell=20)
    c_old = await _product(owner_conn, tenant_a, cat, "C-old", stock=200, sell=1)
    await _sale_at(owner_conn, tenant_a, customer, user, a_recent, now - timedelta(days=1), "a1")
    await _sale_at(owner_conn, tenant_a, customer, user, c_old, now - timedelta(days=100), "c1")
    # B-never has no sale at all.

    stats = await products_service.get_warehouse_stats(app_pool, tenant_a)

    # Totals: 3 products, 100+50+200 = 350 units on hand.
    assert stats["total_products"] == 3
    assert stats["total_units"] == 350
    # Retail value UZS = 100*10 + 50*20 + 200*1 = 2200.
    value_by_currency = {v["currency"]: v["value"] for v in stats["total_value"]}
    assert value_by_currency["UZS"] == 2200

    # Most stocked: C(200) > A(100) > B(50).
    assert [m["name"] for m in stats["most_stocked"]] == ["C-old", "A-recent", "B-never"]

    # Slowest moving: never-sold first (B), then oldest sale (C 100d ago), then A (1d ago).
    assert [m["name"] for m in stats["slow_moving"]] == ["B-never", "C-old", "A-recent"]
    assert stats["slow_moving"][0]["last_sold_at"] is None
    assert stats["slow_moving"][1]["last_sold_at"] is not None


async def test_warehouse_stats_empty_tenant(app_pool, two_tenants):
    tenant_a, _ = two_tenants
    stats = await products_service.get_warehouse_stats(app_pool, tenant_a)
    assert stats["total_products"] == 0
    assert stats["total_units"] == 0
    assert stats["total_value"] == []
    assert stats["most_stocked"] == []
    assert stats["slow_moving"] == []
