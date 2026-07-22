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


class ProductNotFoundError(Exception):
    pass


class InsufficientStockError(Exception):
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
    delivery_mode: str | None = None,
    source: str | None = None,
    product_id: UUID | None = None,
    quantity: int = 1,
) -> tuple[dict, bool]:
    """Returns (sale, is_new). is_new is False when idempotency_key was
    already used for a matching sale -- callers must skip re-posting the
    ledger charge in that case, since it already happened on the first call.

    source (2026-07-15): NULL for the normal human-driven POST /sales path;
    set to a CRM provider name ("amocrm") by crm/service.py's webhook/pull
    ingestion when a deal ("сделка") is created there, so the sale is
    visibly distinguishable in the UI from a manually-created one.

    product_id (2026-07-16): when set, catalog_category_id is overridden
    with the product's own category (so analytics/course-sales and finance's
    category-specific bonus plans, which only ever read catalog_category_id,
    keep working unchanged) and the product's stock is atomically decremented
    by `quantity` -- but only once we know this is a genuinely new sale (not
    an idempotent replay), and inside the same transaction as the insert, so
    a failed decrement (insufficient stock) rolls back the sale insert too."""
    async with tenant_connection(pool, tenant_id) as conn:
        await _validate_refs(conn, customer_id, catalog_category_id, responsible_user_id)
        if product_id is not None:
            product = await repository.get_product_for_sale(conn, product_id)
            if product is None:
                raise ProductNotFoundError
            catalog_category_id = product["category_id"]
        row = await repository.insert_sale(
            conn,
            tenant_id,
            customer_id,
            catalog_category_id,
            responsible_user_id,
            currency,
            price_amount,
            deadline,
            delivery_mode,
            idempotency_key,
            source,
            product_id,
            quantity,
        )
        if row is not None:
            if product_id is not None:
                if await repository.decrement_product_stock(conn, product_id, quantity) is None:
                    raise InsufficientStockError
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
            and existing["product_id"] == product_id
            and existing["quantity"] == quantity
        ):
            return existing, False
        raise IdempotencyKeyReusedError


async def update_sale_status_from_crm(pool: asyncpg.Pool, tenant_id: UUID, idempotency_key: str, status: str) -> None:
    """CRM webhook/pull-driven status transition (2026-07-15) -- e.g. an
    AmoCRM lead moving to a won/lost pipeline stage. Looks the sale up by the
    same synthetic idempotency_key ("crm:{provider}:{external_lead_id}")
    create_sale used to create it, so it only ever touches a sale this
    integration itself created. A version conflict (someone edited the sale
    in Tizimly at the same moment) is logged and dropped rather than retried
    -- this is a best-effort sync, not a strongly-consistent one, same
    trade-off as _get_valid_credential's token refresh fallback in crm."""
    async with tenant_connection(pool, tenant_id) as conn:
        sale = await repository.get_sale_by_idempotency_key(conn, idempotency_key)
        if sale is None or sale["status"] == status or sale["status"] in _TERMINAL_STATUSES:
            return
        await repository.update_sale_status_from_crm(conn, sale["id"], status, sale["version"])


def _assert_owned_or_view_all(sale: dict, caller_id: UUID, can_view_all: bool) -> None:
    """Own-data scoping (2026-07-22): 404, not 403, for a sale the caller
    doesn't own and lacks sales.view_all for -- see customers/service.py's
    identically-named helper for the full rationale."""
    if can_view_all:
        return
    if sale["responsible_user_id"] == caller_id:
        return
    raise SaleNotFoundError


async def get_sale(pool: asyncpg.Pool, tenant_id: UUID, sale_id: UUID, caller_id: UUID, can_view_all: bool) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        sale = await repository.get_sale_by_id(conn, sale_id)
    if sale is None:
        raise SaleNotFoundError
    _assert_owned_or_view_all(sale, caller_id, can_view_all)
    return sale


async def list_sales(
    pool: asyncpg.Pool, tenant_id: UUID, caller_id: UUID, can_view_all: bool, limit: int = 50, offset: int = 0
) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_sales(conn, limit, offset, caller_id, can_view_all)


async def list_sale_changes(
    pool: asyncpg.Pool, tenant_id: UUID, sale_id: UUID, caller_id: UUID, can_view_all: bool
) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        sale = await repository.get_sale_by_id(conn, sale_id)
        if sale is None:
            raise SaleNotFoundError
        _assert_owned_or_view_all(sale, caller_id, can_view_all)
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
    can_view_all: bool,
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        sale = await repository.get_sale_by_id(conn, sale_id)
        if sale is None:
            raise SaleNotFoundError
        _assert_owned_or_view_all(sale, actor_user_id, can_view_all)
        if sale["status"] in _TERMINAL_STATUSES and status != sale["status"]:
            raise InvalidStatusTransitionError
        await _validate_refs(conn, None, catalog_category_id, responsible_user_id)
        updated = await repository.update_sale(
            conn, sale_id, catalog_category_id, responsible_user_id, price_amount, deadline, status, expected_version
        )
        if updated is None:
            raise SaleVersionConflictError
        # Cancelling a product-backed sale restocks it -- completing one does
        # not (that's not a reversal). Guarded on the *old* status so this
        # can't double-restock an already-cancelled sale.
        if status == "cancelled" and sale["status"] != "cancelled" and sale["product_id"] is not None:
            await repository.increment_product_stock(conn, sale["product_id"], sale["quantity"])
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
