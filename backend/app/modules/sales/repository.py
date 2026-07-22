import json
from datetime import datetime
from pathlib import Path
from uuid import UUID

import aiosql
import asyncpg

_queries = aiosql.from_path(
    Path(__file__).parent / "sql" / "queries.sql", "asyncpg", mandatory_parameters=False
)


def _row(record: asyncpg.Record | None) -> dict | None:
    return dict(record) if record is not None else None


async def insert_sale(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    customer_id: UUID,
    catalog_category_id: UUID | None,
    responsible_user_id: UUID,
    currency: str,
    price_amount: int,
    deadline: datetime,
    delivery_mode: str | None,
    idempotency_key: str,
    source: str | None = None,
    product_id: UUID | None = None,
    quantity: int = 1,
) -> dict | None:
    row = await _queries.insert_sale(
        conn,
        tenant_id=tenant_id,
        customer_id=customer_id,
        catalog_category_id=catalog_category_id,
        responsible_user_id=responsible_user_id,
        currency=currency,
        price_amount=price_amount,
        deadline=deadline,
        delivery_mode=delivery_mode,
        idempotency_key=idempotency_key,
        source=source,
        product_id=product_id,
        quantity=quantity,
    )
    return _row(row)


async def get_sale_by_idempotency_key(conn: asyncpg.Connection, idempotency_key: str) -> dict | None:
    row = await _queries.get_sale_by_idempotency_key(conn, idempotency_key=idempotency_key)
    return _row(row)


async def get_sale_by_id(conn: asyncpg.Connection, sale_id: UUID) -> dict | None:
    row = await _queries.get_sale_by_id(conn, sale_id=sale_id)
    return _row(row)


async def list_sales(
    conn: asyncpg.Connection, limit: int, offset: int, caller_id: UUID, can_view_all: bool
) -> list[dict]:
    rows = [
        row
        async for row in _queries.list_sales(
            conn, limit=limit, offset=offset, caller_id=caller_id, can_view_all=can_view_all
        )
    ]
    return [dict(r) for r in rows]


async def update_sale(
    conn: asyncpg.Connection,
    sale_id: UUID,
    catalog_category_id: UUID | None,
    responsible_user_id: UUID,
    price_amount: int,
    deadline: datetime,
    status: str,
    expected_version: int,
) -> dict | None:
    row = await _queries.update_sale(
        conn,
        sale_id=sale_id,
        catalog_category_id=catalog_category_id,
        responsible_user_id=responsible_user_id,
        price_amount=price_amount,
        deadline=deadline,
        status=status,
        expected_version=expected_version,
    )
    return _row(row)


async def update_sale_tariff(
    conn: asyncpg.Connection,
    sale_id: UUID,
    price_amount: int,
    deadline: datetime,
    expected_version: int,
) -> dict | None:
    row = await _queries.update_sale_tariff(
        conn, sale_id=sale_id, price_amount=price_amount, deadline=deadline, expected_version=expected_version
    )
    return _row(row)


async def update_sale_status_from_crm(
    conn: asyncpg.Connection,
    sale_id: UUID,
    status: str,
    expected_version: int,
) -> dict | None:
    row = await _queries.update_sale_status_from_crm(conn, sale_id=sale_id, status=status, expected_version=expected_version)
    return _row(row)


async def insert_sale_change(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    sale_id: UUID,
    actor_user_id: UUID,
    changed_fields: dict,
    reason: str | None,
) -> dict:
    # asyncpg has no built-in dict<->jsonb codec here, so we serialize/deserialize
    # explicitly (default=str covers the UUID/datetime values that show up in diffs).
    row = await _queries.insert_sale_change(
        conn,
        tenant_id=tenant_id,
        sale_id=sale_id,
        actor_user_id=actor_user_id,
        changed_fields=json.dumps(changed_fields, default=str),
        reason=reason,
    )
    result = dict(row)
    result["changed_fields"] = json.loads(result["changed_fields"])
    return result


async def list_sale_changes(conn: asyncpg.Connection, sale_id: UUID) -> list[dict]:
    rows = [row async for row in _queries.list_sale_changes(conn, sale_id=sale_id)]
    result = []
    for r in rows:
        d = dict(r)
        d["changed_fields"] = json.loads(d["changed_fields"])
        result.append(d)
    return result


async def customer_exists(conn: asyncpg.Connection, customer_id: UUID) -> bool:
    row = await _queries.customer_exists(conn, customer_id=customer_id)
    return row["exists"]


async def catalog_category_exists(conn: asyncpg.Connection, catalog_category_id: UUID) -> bool:
    row = await _queries.catalog_category_exists(conn, catalog_category_id=catalog_category_id)
    return row["exists"]


async def user_exists(conn: asyncpg.Connection, user_id: UUID) -> bool:
    row = await _queries.user_exists(conn, user_id=user_id)
    return row["exists"]


async def get_product_for_sale(conn: asyncpg.Connection, product_id: UUID) -> dict | None:
    row = await _queries.get_product_for_sale(conn, product_id=product_id)
    return _row(row)


async def decrement_product_stock(conn: asyncpg.Connection, product_id: UUID, quantity: int) -> dict | None:
    row = await _queries.decrement_product_stock(conn, product_id=product_id, quantity=quantity)
    return _row(row)


async def increment_product_stock(conn: asyncpg.Connection, product_id: UUID, quantity: int) -> None:
    await _queries.increment_product_stock(conn, product_id=product_id, quantity=quantity)
