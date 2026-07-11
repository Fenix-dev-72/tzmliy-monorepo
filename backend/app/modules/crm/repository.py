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
