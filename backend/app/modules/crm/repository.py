import json
from datetime import date
from pathlib import Path
from uuid import UUID

import aiosql
import asyncpg

_queries = aiosql.from_path(Path(__file__).parent / "sql" / "queries.sql", "asyncpg", mandatory_parameters=False)


def _row(record: asyncpg.Record | None) -> dict | None:
    return dict(record) if record is not None else None


def _rows(records: list[asyncpg.Record]) -> list[dict]:
    return [dict(r) for r in records]


def _with_payload(record: asyncpg.Record | None) -> dict | None:
    if record is None:
        return None
    result = dict(record)
    if result["raw_payload"] is not None:
        result["raw_payload"] = json.loads(result["raw_payload"])
    return result


async def upsert_integration_credential_with_account(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    provider: str,
    webhook_secret_encrypted: str | None,
    api_key_encrypted: str | None,
    external_account_id: str | None,
) -> dict:
    row = await _queries.upsert_integration_credential_with_account(
        conn,
        tenant_id=tenant_id,
        provider=provider,
        webhook_secret_encrypted=webhook_secret_encrypted,
        api_key_encrypted=api_key_encrypted,
        external_account_id=external_account_id,
    )
    return _row(row)


async def get_active_integration_credential_with_account(conn: asyncpg.Connection, provider: str) -> dict | None:
    row = await _queries.get_active_integration_credential_with_account(conn, provider=provider)
    return _row(row)


async def list_integration_credentials(conn: asyncpg.Connection) -> list[dict]:
    return _rows([row async for row in _queries.list_integration_credentials(conn)])


async def deactivate_integration_credential(conn: asyncpg.Connection, provider: str) -> None:
    await _queries.deactivate_integration_credential(conn, provider=provider)


async def upsert_oauth_integration_credential(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    provider: str,
    api_key_encrypted: str,
    external_account_id: str | None,
    refresh_token_encrypted: str | None,
    token_expires_at,
    webhook_secret_encrypted: str | None = None,
) -> dict:
    row = await _queries.upsert_oauth_integration_credential(
        conn,
        tenant_id=tenant_id,
        provider=provider,
        api_key_encrypted=api_key_encrypted,
        external_account_id=external_account_id,
        refresh_token_encrypted=refresh_token_encrypted,
        token_expires_at=token_expires_at,
        webhook_secret_encrypted=webhook_secret_encrypted,
    )
    return _row(row)


async def update_integration_credential_tokens(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    provider: str,
    api_key_encrypted: str,
    refresh_token_encrypted: str | None,
    token_expires_at,
) -> None:
    await _queries.update_integration_credential_tokens(
        conn,
        tenant_id=tenant_id,
        provider=provider,
        api_key_encrypted=api_key_encrypted,
        refresh_token_encrypted=refresh_token_encrypted,
        token_expires_at=token_expires_at,
    )


async def insert_crm_lead_sync(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    customer_id: UUID,
    provider: str,
    external_lead_id: str | None,
    direction: str,
    raw_payload: dict | None,
) -> dict:
    row = await _queries.insert_crm_lead_sync(
        conn,
        tenant_id=tenant_id,
        customer_id=customer_id,
        provider=provider,
        external_lead_id=external_lead_id,
        direction=direction,
        raw_payload=json.dumps(raw_payload, default=str) if raw_payload is not None else None,
    )
    return _with_payload(row)


async def list_crm_lead_syncs(conn: asyncpg.Connection) -> list[dict]:
    rows = [row async for row in _queries.list_crm_lead_syncs(conn)]
    return [_with_payload(r) for r in rows]


async def insert_crm_manager_mapping(
    conn: asyncpg.Connection, tenant_id: UUID, provider: str, external_manager_id: str, user_id: UUID
) -> dict | None:
    row = await _queries.insert_crm_manager_mapping(
        conn, tenant_id=tenant_id, provider=provider, external_manager_id=external_manager_id, user_id=user_id
    )
    return _row(row)


async def get_crm_manager_mapping_by_external_id(
    conn: asyncpg.Connection, provider: str, external_manager_id: str
) -> dict | None:
    row = await _queries.get_crm_manager_mapping_by_external_id(
        conn, provider=provider, external_manager_id=external_manager_id
    )
    return _row(row)


async def list_crm_manager_mappings(conn: asyncpg.Connection) -> list[dict]:
    rows = [row async for row in _queries.list_crm_manager_mappings(conn)]
    return _rows(rows)


async def user_has_crm_manager_mapping(conn: asyncpg.Connection, user_id: UUID) -> bool:
    row = await _queries.user_has_crm_manager_mapping(conn, user_id=user_id)
    return row["exists"]


async def get_crm_manager_mapping_by_user(conn: asyncpg.Connection, user_id: UUID) -> dict | None:
    row = await _queries.get_crm_manager_mapping_by_user(conn, user_id=user_id)
    return _row(row)


async def user_exists(conn: asyncpg.Connection, user_id: UUID) -> bool:
    row = await _queries.user_exists(conn, user_id=user_id)
    return row["exists"]


async def upsert_ad_campaign(
    conn: asyncpg.Connection, tenant_id: UUID, provider: str, external_campaign_id: str, name: str, status: str
) -> dict:
    row = await _queries.upsert_ad_campaign(
        conn, tenant_id=tenant_id, provider=provider, external_campaign_id=external_campaign_id, name=name, status=status
    )
    return _row(row)


async def list_ad_campaigns(conn: asyncpg.Connection) -> list[dict]:
    rows = [row async for row in _queries.list_ad_campaigns(conn)]
    return _rows(rows)


async def upsert_ad_insight(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    campaign_id: UUID,
    insight_date: date,
    impressions: int,
    clicks: int,
    spend_amount: int,
    currency: str,
) -> dict:
    row = await _queries.upsert_ad_insight(
        conn,
        tenant_id=tenant_id,
        campaign_id=campaign_id,
        insight_date=insight_date,
        impressions=impressions,
        clicks=clicks,
        spend_amount=spend_amount,
        currency=currency,
    )
    return _row(row)


async def list_ad_insights(conn: asyncpg.Connection, campaign_id: UUID | None) -> list[dict]:
    rows = [row async for row in _queries.list_ad_insights(conn, campaign_id=campaign_id)]
    return _rows(rows)
