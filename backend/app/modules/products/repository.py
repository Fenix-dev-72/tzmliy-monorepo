from pathlib import Path
from uuid import UUID

import aiosql
import asyncpg

_queries = aiosql.from_path(
    Path(__file__).parent / "sql" / "queries.sql", "asyncpg", mandatory_parameters=False
)


def _row(record: asyncpg.Record | None) -> dict | None:
    return dict(record) if record is not None else None


async def insert_product(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    category_id: UUID,
    name: str,
    cost_price_amount: int,
    cost_price_currency: str,
    sell_price_amount: int,
    sell_price_currency: str,
    stock_quantity: int,
) -> dict:
    row = await _queries.insert_product(
        conn,
        tenant_id=tenant_id,
        category_id=category_id,
        name=name,
        cost_price_amount=cost_price_amount,
        cost_price_currency=cost_price_currency,
        sell_price_amount=sell_price_amount,
        sell_price_currency=sell_price_currency,
        stock_quantity=stock_quantity,
    )
    return _row(row)


async def get_product_by_id(conn: asyncpg.Connection, product_id: UUID) -> dict | None:
    row = await _queries.get_product_by_id(conn, product_id=product_id)
    return _row(row)


async def list_products(conn: asyncpg.Connection, category_id: UUID | None) -> list[dict]:
    rows = [row async for row in _queries.list_products(conn, category_id=category_id)]
    return [dict(r) for r in rows]


async def update_product(
    conn: asyncpg.Connection,
    product_id: UUID,
    category_id: UUID,
    name: str,
    cost_price_amount: int,
    cost_price_currency: str,
    sell_price_amount: int,
    sell_price_currency: str,
) -> None:
    await _queries.update_product(
        conn,
        product_id=product_id,
        category_id=category_id,
        name=name,
        cost_price_amount=cost_price_amount,
        cost_price_currency=cost_price_currency,
        sell_price_amount=sell_price_amount,
        sell_price_currency=sell_price_currency,
    )


async def delete_product(conn: asyncpg.Connection, product_id: UUID) -> None:
    await _queries.delete_product(conn, product_id=product_id)


async def adjust_stock(conn: asyncpg.Connection, product_id: UUID, delta: int) -> dict | None:
    row = await _queries.adjust_stock(conn, product_id=product_id, delta=delta)
    return _row(row)


async def set_product_photo(conn: asyncpg.Connection, product_id: UUID, photo_object_key: str) -> None:
    await _queries.set_product_photo(conn, product_id=product_id, photo_object_key=photo_object_key)


async def category_exists(conn: asyncpg.Connection, category_id: UUID) -> bool:
    row = await _queries.category_exists(conn, category_id=category_id)
    return row["exists"]
