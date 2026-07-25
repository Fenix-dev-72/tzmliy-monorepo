"""A sale auto-completes once its balance is fully paid (client request).
finance.record_payment flips an 'active' sale to 'completed' when the last
payment clears the balance, and leaves it 'active' on a partial payment.
"""

from datetime import datetime, timezone
from uuid import uuid4

from app.modules.finance import service as finance_service

_DEADLINE = datetime(2026, 12, 31, tzinfo=timezone.utc)


async def _sale_with_charge(owner_conn, tenant_id, customer, user, price, key):
    sale_id = await owner_conn.fetchval(
        "INSERT INTO sales (tenant_id, customer_id, responsible_user_id, currency, price_amount, deadline, "
        "idempotency_key, status) VALUES ($1, $2, $3, 'UZS', $4, $5, $6, 'active') RETURNING id",
        tenant_id,
        customer,
        user,
        price,
        _DEADLINE,
        key,
    )
    # The initial charge (positive = customer owes) — sales.create_sale posts
    # this via finance in the real flow; seeded directly here.
    await owner_conn.execute(
        "INSERT INTO ledger_entries (tenant_id, sale_id, customer_id, entry_type, amount, currency, created_by_user_id) "
        "VALUES ($1, $2, $3, 'charge', $4, 'UZS', $5)",
        tenant_id,
        sale_id,
        customer,
        price,
        user,
    )
    return sale_id


async def _customer(owner_conn, tenant_id):
    return await owner_conn.fetchval(
        "INSERT INTO customers (tenant_id, full_name) VALUES ($1, $2) RETURNING id", tenant_id, "Cust"
    )


async def test_full_payment_completes_sale(app_pool, owner_conn, two_tenants, tenant_users):
    tenant_a, _ = two_tenants
    user = tenant_users[tenant_a]
    customer = await _customer(owner_conn, tenant_a)
    sale_id = await _sale_with_charge(owner_conn, tenant_a, customer, user, 1000, f"s-{uuid4().hex}")

    await finance_service.record_payment(app_pool, tenant_a, user, sale_id, 1000, "UZS", "cash", f"pay-{uuid4().hex}")

    status = await owner_conn.fetchval("SELECT status FROM sales WHERE id = $1", sale_id)
    assert status == "completed"
    # The transition is recorded in sale_changes history, not silently applied.
    change = await owner_conn.fetchval(
        "SELECT changed_fields::text FROM sale_changes WHERE sale_id = $1 ORDER BY created_at DESC LIMIT 1", sale_id
    )
    assert change is not None and "completed" in change


async def test_partial_payment_keeps_sale_active(app_pool, owner_conn, two_tenants, tenant_users):
    tenant_a, _ = two_tenants
    user = tenant_users[tenant_a]
    customer = await _customer(owner_conn, tenant_a)
    sale_id = await _sale_with_charge(owner_conn, tenant_a, customer, user, 1000, f"s-{uuid4().hex}")

    await finance_service.record_payment(app_pool, tenant_a, user, sale_id, 400, "UZS", "cash", f"pay-{uuid4().hex}")

    status = await owner_conn.fetchval("SELECT status FROM sales WHERE id = $1", sale_id)
    assert status == "active"


async def test_paying_the_remainder_completes_sale(app_pool, owner_conn, two_tenants, tenant_users):
    tenant_a, _ = two_tenants
    user = tenant_users[tenant_a]
    customer = await _customer(owner_conn, tenant_a)
    sale_id = await _sale_with_charge(owner_conn, tenant_a, customer, user, 1000, f"s-{uuid4().hex}")

    await finance_service.record_payment(app_pool, tenant_a, user, sale_id, 600, "UZS", "cash", f"pay-{uuid4().hex}")
    assert await owner_conn.fetchval("SELECT status FROM sales WHERE id = $1", sale_id) == "active"
    # Paying the last 400 clears the balance -> auto-complete.
    await finance_service.record_payment(app_pool, tenant_a, user, sale_id, 400, "UZS", "cash", f"pay-{uuid4().hex}")
    assert await owner_conn.fetchval("SELECT status FROM sales WHERE id = $1", sale_id) == "completed"
