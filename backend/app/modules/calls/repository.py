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


async def upsert_integration_credential(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    provider: str,
    webhook_secret_encrypted: str,
    api_key_encrypted: str | None,
) -> dict:
    row = await _queries.upsert_integration_credential(
        conn,
        tenant_id=tenant_id,
        provider=provider,
        webhook_secret_encrypted=webhook_secret_encrypted,
        api_key_encrypted=api_key_encrypted,
    )
    return _row(row)


async def list_integration_credentials(conn: asyncpg.Connection) -> list[dict]:
    rows = [row async for row in _queries.list_integration_credentials(conn)]
    return [dict(r) for r in rows]


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


async def get_active_integration_credential(conn: asyncpg.Connection, provider: str) -> dict | None:
    row = await _queries.get_active_integration_credential(conn, provider=provider)
    return _row(row)


async def deactivate_integration_credential(conn: asyncpg.Connection, provider: str) -> None:
    await _queries.deactivate_integration_credential(conn, provider=provider)


async def claim_webhook_event(conn: asyncpg.Connection, tenant_id: UUID, provider: str, external_event_id: str) -> bool:
    """True if this (tenant_id, provider, external_event_id) hasn't been seen
    before (and is now claimed) -- False means it's a retry/duplicate.
    Callers must check this before insert_webhook_event, not after."""
    row = await _queries.claim_webhook_event(
        conn, tenant_id=tenant_id, provider=provider, external_event_id=external_event_id
    )
    return row is not None


async def insert_webhook_event(
    conn: asyncpg.Connection, tenant_id: UUID, provider: str, external_event_id: str, raw_payload: dict, signature_valid: bool
) -> dict:
    row = await _queries.insert_webhook_event(
        conn,
        tenant_id=tenant_id,
        provider=provider,
        external_event_id=external_event_id,
        raw_payload=json.dumps(raw_payload, default=str),
        signature_valid=signature_valid,
    )
    result = dict(row)
    result["raw_payload"] = json.loads(result["raw_payload"])
    return result


async def mark_webhook_event_processed(conn: asyncpg.Connection, event_id: UUID) -> None:
    await _queries.mark_webhook_event_processed(conn, event_id=event_id)


async def get_manager_mapping_by_agent(conn: asyncpg.Connection, provider: str, external_agent_id: str) -> dict | None:
    row = await _queries.get_manager_mapping_by_agent(conn, provider=provider, external_agent_id=external_agent_id)
    return _row(row)


async def insert_manager_mapping(
    conn: asyncpg.Connection, tenant_id: UUID, provider: str, external_agent_id: str, user_id: UUID
) -> dict | None:
    row = await _queries.insert_manager_mapping(
        conn, tenant_id=tenant_id, provider=provider, external_agent_id=external_agent_id, user_id=user_id
    )
    return _row(row)


async def list_manager_mappings(conn: asyncpg.Connection) -> list[dict]:
    rows = [row async for row in _queries.list_manager_mappings(conn)]
    return [dict(r) for r in rows]


async def user_has_manager_mapping(conn: asyncpg.Connection, user_id: UUID) -> bool:
    row = await _queries.user_has_manager_mapping(conn, user_id=user_id)
    return row["exists"]


async def user_exists(conn: asyncpg.Connection, user_id: UUID) -> bool:
    row = await _queries.user_exists(conn, user_id=user_id)
    return row["exists"]


async def insert_call(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    provider: str,
    external_call_id: str,
    direction: str,
    from_number: str,
    to_number: str,
    responsible_user_id: UUID | None,
    duration_seconds: int,
    status: str,
    started_at: datetime,
    ended_at: datetime | None,
) -> dict | None:
    row = await _queries.insert_call(
        conn,
        tenant_id=tenant_id,
        provider=provider,
        external_call_id=external_call_id,
        direction=direction,
        from_number=from_number,
        to_number=to_number,
        responsible_user_id=responsible_user_id,
        duration_seconds=duration_seconds,
        status=status,
        started_at=started_at,
        ended_at=ended_at,
    )
    return _row(row)


async def get_call_by_external_id(conn: asyncpg.Connection, provider: str, external_call_id: str) -> dict | None:
    row = await _queries.get_call_by_external_id(conn, provider=provider, external_call_id=external_call_id)
    return _row(row)


async def get_call_by_id(conn: asyncpg.Connection, call_id: UUID) -> dict | None:
    row = await _queries.get_call_by_id(conn, call_id=call_id)
    return _row(row)


async def update_call_recording_key(conn: asyncpg.Connection, call_id: UUID, recording_object_key: str) -> None:
    await _queries.update_call_recording_key(conn, call_id=call_id, recording_object_key=recording_object_key)


async def set_pending_recording_url(conn: asyncpg.Connection, call_id: UUID, recording_url: str) -> None:
    await _queries.set_pending_recording_url(conn, call_id=call_id, recording_url=recording_url)


async def claim_calls_with_pending_recording(conn: asyncpg.Connection, limit: int) -> list[dict]:
    rows = [row async for row in _queries.claim_calls_with_pending_recording(conn, limit=limit)]
    return [dict(r) for r in rows]


async def mark_call_recording_failed(conn: asyncpg.Connection, call_id: UUID, max_attempts: int) -> None:
    await _queries.mark_call_recording_failed(conn, call_id=call_id, max_attempts=max_attempts)


async def list_calls(
    conn: asyncpg.Connection, caller_id: UUID, can_view_all: bool, limit: int, offset: int
) -> list[dict]:
    rows = [
        row
        async for row in _queries.list_calls(
            conn, caller_id=caller_id, can_view_all=can_view_all, limit=limit, offset=offset
        )
    ]
    return [dict(r) for r in rows]


async def customer_has_missed_call(conn: asyncpg.Connection, phone: str) -> bool:
    row = await _queries.customer_has_missed_call(conn, phone=phone)
    return row["exists"]
