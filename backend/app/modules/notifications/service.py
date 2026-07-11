from datetime import datetime
from uuid import UUID, uuid4

import asyncpg

from app.core import storage
from app.core.crypto import encrypt_secret
from app.core.database import platform_connection, tenant_connection
from app.modules.calls import repository as calls_repository
from app.modules.notifications import reports, repository
from app.modules.tenants import repository as tenants_repository

TELEGRAM_PROVIDER = "telegram"


class GroupMappingNotFoundError(Exception):
    pass


class InvalidPeriodError(Exception):
    pass


class TelegramNotConfiguredError(Exception):
    pass


async def configure_telegram_bot(pool: asyncpg.Pool, tenant_id: UUID, bot_token: str) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        await calls_repository.upsert_integration_credential(
            conn, tenant_id, TELEGRAM_PROVIDER, encrypt_secret(bot_token), None
        )
    return {"configured": True}


async def get_telegram_status(pool: asyncpg.Pool, tenant_id: UUID) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        credential = await calls_repository.get_active_integration_credential(conn, TELEGRAM_PROVIDER)
    return {"configured": credential is not None}


async def create_group_mapping(
    pool: asyncpg.Pool, tenant_id: UUID, category_id: UUID | None, telegram_chat_id: int, label: str
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        if category_id is None:
            return await repository.upsert_default_group_mapping(conn, tenant_id, telegram_chat_id, label)
        return await repository.upsert_group_mapping_for_category(conn, tenant_id, category_id, telegram_chat_id, label)


async def list_group_mappings(pool: asyncpg.Pool, tenant_id: UUID) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_group_mappings(conn)


async def _resolve_chat_id(conn: asyncpg.Connection, category_id: UUID | None) -> int:
    mapping = None
    if category_id is not None:
        mapping = await repository.get_group_mapping_by_category(conn, category_id)
    if mapping is None:
        mapping = await repository.get_default_group_mapping(conn)
    if mapping is None:
        raise GroupMappingNotFoundError
    return mapping["telegram_chat_id"]


async def send_group_message(
    pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID, category_id: UUID | None, text: str
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        if await calls_repository.get_active_integration_credential(conn, TELEGRAM_PROVIDER) is None:
            raise TelegramNotConfiguredError
        chat_id = await _resolve_chat_id(conn, category_id)
        return await repository.enqueue_message(conn, tenant_id, chat_id, text, category_id, user_id)


async def send_sales_summary_report(
    pool: asyncpg.Pool,
    tenant_id: UUID,
    user_id: UUID,
    category_id: UUID | None,
    period_start: datetime,
    period_end: datetime,
) -> dict:
    if period_end <= period_start:
        raise InvalidPeriodError

    async with platform_connection(pool) as conn:
        tenant = await tenants_repository.get_tenant_by_id(conn, tenant_id)
    tenant_name = tenant["name"] if tenant is not None else str(tenant_id)

    async with tenant_connection(pool, tenant_id) as conn:
        if await calls_repository.get_active_integration_credential(conn, TELEGRAM_PROVIDER) is None:
            raise TelegramNotConfiguredError
        chat_id = await _resolve_chat_id(conn, category_id)
        rows = await repository.get_sales_summary_rows(conn, period_start, period_end, category_id)

        pdf_bytes = reports.render_sales_summary_pdf(tenant_name, period_start, period_end, rows)
        object_key = f"reports/{tenant_id}/{uuid4()}.pdf"
        await storage.put_object(object_key, pdf_bytes, content_type="application/pdf")
        filename = f"sales-summary-{period_start:%Y%m%d}-{period_end:%Y%m%d}.pdf"

        return await repository.enqueue_document(conn, tenant_id, chat_id, object_key, filename, category_id, user_id)


async def list_outbox(pool: asyncpg.Pool, tenant_id: UUID) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_outbox_for_tenant(conn)


async def list_delivery_log(pool: asyncpg.Pool, tenant_id: UUID, outbox_id: UUID | None) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_delivery_log(conn, outbox_id)
