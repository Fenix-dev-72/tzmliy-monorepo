from datetime import datetime
from typing import Any
from uuid import UUID

import asyncpg

from app.core.database import tenant_connection
from app.modules.sales import repository

_TERMINAL_STATUSES = frozenset({"completed", "cancelled"})
_TRACKED_FIELDS = ("catalog_category_id", "responsible_user_id", "price_amount", "deadline", "status")


class CustomerNotFoundError(Exception):
    pass


class CatalogCategoryNotFoundError(Exception):
    pass


class ResponsibleUserNotFoundError(Exception):
    pass


class SaleNotFoundError(Exception):
    pass


class SaleVersionConflictError(Exception):
    pass


class InvalidStatusTransitionError(Exception):
    pass


class IdempotencyKeyReusedError(Exception):
    pass


async def _validate_refs(
    conn: asyncpg.Connection,
    customer_id: UUID | None,
    catalog_category_id: UUID | None,
    responsible_user_id: UUID | None,
) -> None:
    if customer_id is not None and not await repository.customer_exists(conn, customer_id):
        raise CustomerNotFoundError
    if catalog_category_id is not None and not await repository.catalog_category_exists(conn, catalog_category_id):
        raise CatalogCategoryNotFoundError
    if responsible_user_id is not None and not await repository.user_exists(conn, responsible_user_id):
        raise ResponsibleUserNotFoundError


def _diff(old: dict, new_values: dict) -> dict[str, Any]:
    changed = {}
    for field in _TRACKED_FIELDS:
        old_value = old[field]
        new_value = new_values[field]
        if old_value != new_value:
            changed[field] = {"old": old_value, "new": new_value}
    return changed


async def create_sale(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    customer_id: UUID,
    catalog_category_id: UUID | None,
    responsible_user_id: UUID,
    currency: str,
    price_amount: int,
    deadline: datetime,
    idempotency_key: str,
) -> tuple[dict, bool]:
    """Returns (sale, is_new). is_new is False when idempotency_key was
    already used for a matching sale -- callers must skip re-posting the
    ledger charge in that case, since it already happened on the first call."""
    async with tenant_connection(pool, tenant_id) as conn:
        await _validate_refs(conn, customer_id, catalog_category_id, responsible_user_id)
        row = await repository.insert_sale(
            conn,
            tenant_id,
            customer_id,
            catalog_category_id,
            responsible_user_id,
            currency,
            price_amount,
            deadline,
            idempotency_key,
        )
        if row is not None:
            return row, True
        existing = await repository.get_sale_by_idempotency_key(conn, idempotency_key)
        if (
            existing is not None
            and existing["customer_id"] == customer_id
            and existing["catalog_category_id"] == catalog_category_id
            and existing["responsible_user_id"] == responsible_user_id
            and existing["currency"] == currency
            and existing["price_amount"] == price_amount
            and existing["deadline"] == deadline
        ):
            return existing, False
        raise IdempotencyKeyReusedError


async def get_sale(pool: asyncpg.Pool, tenant_id: UUID, sale_id: UUID) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        sale = await repository.get_sale_by_id(conn, sale_id)
    if sale is None:
        raise SaleNotFoundError
    return sale


async def list_sales(pool: asyncpg.Pool, tenant_id: UUID) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_sales(conn)


async def list_sale_changes(pool: asyncpg.Pool, tenant_id: UUID, sale_id: UUID) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        if await repository.get_sale_by_id(conn, sale_id) is None:
            raise SaleNotFoundError
        return await repository.list_sale_changes(conn, sale_id)


async def update_sale(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    sale_id: UUID,
    actor_user_id: UUID,
    catalog_category_id: UUID | None,
    responsible_user_id: UUID,
    price_amount: int,
    deadline: datetime,
    status: str,
    expected_version: int,
    reason: str | None,
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        sale = await repository.get_sale_by_id(conn, sale_id)
        if sale is None:
            raise SaleNotFoundError
        if sale["status"] in _TERMINAL_STATUSES and status != sale["status"]:
            raise InvalidStatusTransitionError
        await _validate_refs(conn, None, catalog_category_id, responsible_user_id)
        updated = await repository.update_sale(
            conn, sale_id, catalog_category_id, responsible_user_id, price_amount, deadline, status, expected_version
        )
        if updated is None:
            raise SaleVersionConflictError
        changed = _diff(
            sale,
            {
                "catalog_category_id": catalog_category_id,
                "responsible_user_id": responsible_user_id,
                "price_amount": price_amount,
                "deadline": deadline,
                "status": status,
            },
        )
        if changed:
            await repository.insert_sale_change(conn, tenant_id, sale_id, actor_user_id, changed, reason)
        return updated


async def apply_tariff_change(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    sale_id: UUID,
    actor_user_id: UUID,
    new_price_amount: int | None,
    new_deadline: datetime | None,
    expected_version: int,
    reason: str | None,
) -> dict:
    """The only entry point outside this module allowed to mutate a sale's
    price/deadline -- called by finance when a tariff_change adjustment_request
    is approved."""
    async with tenant_connection(pool, tenant_id) as conn:
        sale = await repository.get_sale_by_id(conn, sale_id)
        if sale is None:
            raise SaleNotFoundError
        price_amount = new_price_amount if new_price_amount is not None else sale["price_amount"]
        deadline = new_deadline if new_deadline is not None else sale["deadline"]
        updated = await repository.update_sale_tariff(conn, sale_id, price_amount, deadline, expected_version)
        if updated is None:
            raise SaleVersionConflictError
        changed = _diff(
            sale,
            {
                "catalog_category_id": sale["catalog_category_id"],
                "responsible_user_id": sale["responsible_user_id"],
                "price_amount": price_amount,
                "deadline": deadline,
                "status": sale["status"],
            },
        )
        if changed:
            await repository.insert_sale_change(conn, tenant_id, sale_id, actor_user_id, changed, reason)
        return updated
