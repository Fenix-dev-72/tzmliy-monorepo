"""Product-level sales summary (the new /analytics/product-sales endpoint that
backs the dashboard "Top mahsulotlar" donut). Seeds a product plus two sales of
it and asserts units are summed, category-only sales are excluded, and RLS keeps
it tenant-scoped. Drives the real repository query through tenant_connection.
"""

from datetime import datetime, timezone

from app.core.database import tenant_connection
from app.modules.analytics import repository

_START = datetime(2000, 1, 1, tzinfo=timezone.utc)
_END = datetime(2100, 1, 1, tzinfo=timezone.utc)
_DEADLINE = datetime(2026, 12, 31, tzinfo=timezone.utc)


async def _seed_product(owner_conn, tenant_id, name):
    cat = await owner_conn.fetchval(
        "INSERT INTO catalog_categories (tenant_id, name) VALUES ($1, $2) RETURNING id", tenant_id, f"cat-{name}"
    )
    product = await owner_conn.fetchval(
        "INSERT INTO products (tenant_id, category_id, name, cost_price_amount, cost_price_currency, "
        "sell_price_amount, sell_price_currency) VALUES ($1, $2, $3, 1000, 'UZS', 2000, 'UZS') RETURNING id",
        tenant_id,
        cat,
        name,
    )
    return cat, product


async def _sale(owner_conn, tenant_id, customer, user, *, product_id=None, category_id=None, quantity=1, key=""):
    await owner_conn.execute(
        "INSERT INTO sales (tenant_id, customer_id, responsible_user_id, currency, price_amount, deadline, "
        "idempotency_key, product_id, catalog_category_id, quantity) "
        "VALUES ($1, $2, $3, 'UZS', 2000, $4, $5, $6, $7, $8)",
        tenant_id,
        customer,
        user,
        _DEADLINE,
        key,
        product_id,
        category_id,
        quantity,
    )


async def test_product_sales_sums_units_and_excludes_category_only(app_pool, owner_conn, two_tenants, tenant_users):
    tenant_a, _ = two_tenants
    user_a = tenant_users[tenant_a]
    cat, product = await _seed_product(owner_conn, tenant_a, "Widget")
    customer = await owner_conn.fetchval(
        "INSERT INTO customers (tenant_id, full_name) VALUES ($1, $2) RETURNING id", tenant_a, "Cust"
    )
    # two sales of the product: 3 + 2 = 5 units
    await _sale(owner_conn, tenant_a, customer, user_a, product_id=product, quantity=3, key=f"p1-{product}")
    await _sale(owner_conn, tenant_a, customer, user_a, product_id=product, quantity=2, key=f"p2-{product}")
    # a category-only sale (no product) must NOT show up in product summary
    await _sale(owner_conn, tenant_a, customer, user_a, category_id=cat, quantity=9, key=f"cat-{product}")

    async with tenant_connection(app_pool, tenant_a) as conn:
        rows = await repository.get_product_sales_summary(conn, _START, _END, user_a, True)

    by_id = {r["product_id"]: r for r in rows}
    assert product in by_id
    assert by_id[product]["units_sold"] == 5
    assert by_id[product]["product_name"] == "Widget"


async def test_product_sales_is_tenant_isolated(app_pool, owner_conn, two_tenants, tenant_users):
    tenant_a, tenant_b = two_tenants
    _, product = await _seed_product(owner_conn, tenant_a, "AWidget")
    customer = await owner_conn.fetchval(
        "INSERT INTO customers (tenant_id, full_name) VALUES ($1, $2) RETURNING id", tenant_a, "Cust"
    )
    await _sale(owner_conn, tenant_a, customer, tenant_users[tenant_a], product_id=product, quantity=4, key=f"iso-{product}")

    async with tenant_connection(app_pool, tenant_b) as conn:
        rows_b = await repository.get_product_sales_summary(conn, _START, _END, tenant_users[tenant_b], True)

    assert all(r["product_id"] != product for r in rows_b), "tenant B must not see tenant A's product sales"
