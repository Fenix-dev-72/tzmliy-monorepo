from uuid import UUID

import asyncpg

from app.core.database import tenant_connection
from app.modules.customers import repository


class CustomerNotFoundError(Exception):
    pass


class DuplicatePhoneError(Exception):
    pass


class ResponsibleUserNotFoundError(Exception):
    pass


async def create_customer(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    full_name: str,
    phone: str,
    responsible_user_id: UUID | None,
    stage: str,
    created_by_user_id: UUID | None = None,
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        if responsible_user_id is not None and not await repository.user_exists(conn, responsible_user_id):
            raise ResponsibleUserNotFoundError
        row = await repository.insert_customer(
            conn, tenant_id, full_name, phone, responsible_user_id, stage, created_by_user_id=created_by_user_id
        )
        if row is None:
            raise DuplicatePhoneError
        return row


def _assert_owned_or_view_all(customer: dict, caller_id: UUID, can_view_all: bool) -> None:
    """Own-data scoping (2026-07-22): 404, not 403, for a customer the caller
    doesn't own and lacks customers.view_all for -- matches the repo's
    existing "never confirm a row exists" convention (see auth's
    account-enumeration guards)."""
    if can_view_all:
        return
    if customer["responsible_user_id"] == caller_id or customer["created_by_user_id"] == caller_id:
        return
    raise CustomerNotFoundError


async def get_customer(
    pool: asyncpg.Pool, tenant_id: UUID, customer_id: UUID, caller_id: UUID, can_view_all: bool
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        customer = await repository.get_customer_by_id(conn, customer_id)
    if customer is None:
        raise CustomerNotFoundError
    _assert_owned_or_view_all(customer, caller_id, can_view_all)
    return customer


async def get_customer_by_phone(pool: asyncpg.Pool, tenant_id: UUID, phone: str) -> dict:
    """Backs the "phone already exists" recovery path in the sales inline
    add-customer form: instead of just erroring on a 409, the frontend looks
    the existing customer up by the same phone and offers to select them
    directly, closer to a search-as-you-type experience. Deliberately NOT
    own-data scoped (2026-07-22) -- this is conflict resolution for a phone
    number the caller is actively trying to register, not general browsing;
    scoping it would just dead-end the recovery flow when the phone belongs
    to someone else's customer."""
    async with tenant_connection(pool, tenant_id) as conn:
        customer = await repository.get_customer_by_phone(conn, phone)
    if customer is None:
        raise CustomerNotFoundError
    return customer


async def list_customers(
    pool: asyncpg.Pool, tenant_id: UUID, caller_id: UUID, can_view_all: bool, limit: int = 50, offset: int = 0
) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_customers(conn, limit, offset, caller_id, can_view_all)


async def update_customer(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    customer_id: UUID,
    actor_user_id: UUID,
    full_name: str,
    phone: str,
    responsible_user_id: UUID | None,
    stage: str,
    can_view_all: bool,
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        existing = await repository.get_customer_by_id(conn, customer_id)
        if existing is None:
            raise CustomerNotFoundError
        _assert_owned_or_view_all(existing, actor_user_id, can_view_all)
        if responsible_user_id is not None and not await repository.user_exists(conn, responsible_user_id):
            raise ResponsibleUserNotFoundError
        try:
            updated = await repository.update_customer(conn, customer_id, full_name, phone, responsible_user_id, stage)
        except asyncpg.UniqueViolationError as exc:
            raise DuplicatePhoneError from exc
        if stage != existing["stage"]:
            note = f"stage: {existing['stage']} -> {stage}"
            await repository.insert_customer_activity(
                conn, tenant_id, customer_id, actor_user_id, "status_change", note
            )
        return updated


async def create_customer_activity(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    customer_id: UUID,
    actor_user_id: UUID,
    activity_type: str,
    note: str | None,
    can_view_all: bool,
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        customer = await repository.get_customer_by_id(conn, customer_id)
        if customer is None:
            raise CustomerNotFoundError
        _assert_owned_or_view_all(customer, actor_user_id, can_view_all)
        return await repository.insert_customer_activity(conn, tenant_id, customer_id, actor_user_id, activity_type, note)


async def list_customer_activities(
    pool: asyncpg.Pool, tenant_id: UUID, customer_id: UUID, caller_id: UUID, can_view_all: bool
) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        customer = await repository.get_customer_by_id(conn, customer_id)
        if customer is None:
            raise CustomerNotFoundError
        _assert_owned_or_view_all(customer, caller_id, can_view_all)
        return await repository.list_customer_activities(conn, customer_id)
