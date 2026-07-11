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
    pool: asyncpg.Pool, tenant_id: UUID, full_name: str, phone: str, responsible_user_id: UUID | None, stage: str
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        if responsible_user_id is not None and not await repository.user_exists(conn, responsible_user_id):
            raise ResponsibleUserNotFoundError
        row = await repository.insert_customer(conn, tenant_id, full_name, phone, responsible_user_id, stage)
        if row is None:
            raise DuplicatePhoneError
        return row


async def get_customer(pool: asyncpg.Pool, tenant_id: UUID, customer_id: UUID) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        customer = await repository.get_customer_by_id(conn, customer_id)
    if customer is None:
        raise CustomerNotFoundError
    return customer


async def list_customers(pool: asyncpg.Pool, tenant_id: UUID) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_customers(conn)


async def update_customer(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    customer_id: UUID,
    actor_user_id: UUID,
    full_name: str,
    phone: str,
    responsible_user_id: UUID | None,
    stage: str,
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        existing = await repository.get_customer_by_id(conn, customer_id)
        if existing is None:
            raise CustomerNotFoundError
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
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        if await repository.get_customer_by_id(conn, customer_id) is None:
            raise CustomerNotFoundError
        return await repository.insert_customer_activity(conn, tenant_id, customer_id, actor_user_id, activity_type, note)


async def list_customer_activities(pool: asyncpg.Pool, tenant_id: UUID, customer_id: UUID) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        if await repository.get_customer_by_id(conn, customer_id) is None:
            raise CustomerNotFoundError
        return await repository.list_customer_activities(conn, customer_id)
