import json
import logging
from uuid import UUID

import asyncpg

from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.database import tenant_connection
from app.core.storage import presigned_get_url, put_object
from app.modules.calls import repository
from app.modules.calls.providers import download_recording, get_provider

logger = logging.getLogger(__name__)


class InvalidSignatureError(Exception):
    pass


class IntegrationNotConfiguredError(Exception):
    pass


class UserNotFoundError(Exception):
    pass


class CallNotFoundError(Exception):
    pass


class RecordingNotAvailableError(Exception):
    pass


async def configure_integration(
    pool: asyncpg.Pool, tenant_id: UUID, provider: str, webhook_secret: str, api_key: str | None
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.upsert_integration_credential(
            conn,
            tenant_id,
            provider,
            encrypt_secret(webhook_secret),
            encrypt_secret(api_key) if api_key else None,
        )


async def list_integrations(pool: asyncpg.Pool, tenant_id: UUID) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_integration_credentials(conn)


async def create_manager_mapping(
    pool: asyncpg.Pool, tenant_id: UUID, provider: str, external_agent_id: str, user_id: UUID
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        if not await repository.user_exists(conn, user_id):
            raise UserNotFoundError
        row = await repository.insert_manager_mapping(conn, tenant_id, provider, external_agent_id, user_id)
        if row is None:
            row = await repository.get_manager_mapping_by_agent(conn, provider, external_agent_id)
        return row


async def list_manager_mappings(pool: asyncpg.Pool, tenant_id: UUID) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_manager_mappings(conn)


async def list_calls(pool: asyncpg.Pool, tenant_id: UUID, responsible_user_id: UUID | None) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_calls(conn, responsible_user_id)


async def get_call(pool: asyncpg.Pool, tenant_id: UUID, call_id: UUID) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        call = await repository.get_call_by_id(conn, call_id)
    if call is None:
        raise CallNotFoundError
    return call


async def get_recording_url(pool: asyncpg.Pool, tenant_id: UUID, call_id: UUID) -> str:
    async with tenant_connection(pool, tenant_id) as conn:
        call = await repository.get_call_by_id(conn, call_id)
    if call is None:
        raise CallNotFoundError
    if call["recording_object_key"] is None:
        raise RecordingNotAvailableError
    return await presigned_get_url(call["recording_object_key"])


async def ingest_webhook(
    pool: asyncpg.Pool, provider_name: str, tenant_id: UUID, raw_body: bytes, headers: dict
) -> dict:
    """Two-transaction flow: Tx#1 verifies the signature and writes the
    webhook_events/calls rows; the (possibly slow) recording download runs
    outside any transaction so a slow provider doesn't hold a DB connection;
    Tx#2 records the outcome. No background worker/outbox exists yet, so all
    of this happens synchronously within the webhook request -- a slow or
    unavailable provider recording endpoint will slow down webhook processing
    until a later phase adds one.

    tenant_id here comes from the URL path, not a session -- webhooks have no
    authenticated caller. This is a deliberate, narrow exception to "tenant_id
    never from client input": the URL segment is only routing, and the actual
    authentication is the HMAC signature verified against *that tenant's*
    stored secret. A forged tenant_id is useless without the matching secret.
    """
    provider = get_provider(provider_name)

    async with tenant_connection(pool, tenant_id) as conn:
        credential = await repository.get_active_integration_credential(conn, provider_name)
        if credential is None:
            raise IntegrationNotConfiguredError
        secret = decrypt_secret(credential["webhook_secret_encrypted"])
        if not provider.verify_signature(raw_body, headers, secret):
            # Not persisted: an attacker can put any tenant_id in the URL, so
            # writing unbounded unauthenticated payloads would be a DoS
            # write-amplification vector. Only signature-valid events reach
            # webhook_events.
            raise InvalidSignatureError

        payload = json.loads(raw_body)
        event = provider.parse_event(payload)

        claimed = await repository.claim_webhook_event(conn, tenant_id, provider_name, event.external_event_id)
        if not claimed:
            return {"status": "duplicate"}
        webhook_event = await repository.insert_webhook_event(
            conn, tenant_id, provider_name, event.external_event_id, payload, True
        )

        responsible_user_id = None
        if event.external_agent_id:
            mapping = await repository.get_manager_mapping_by_agent(conn, provider_name, event.external_agent_id)
            if mapping is not None:
                responsible_user_id = mapping["user_id"]

        call = await repository.insert_call(
            conn,
            tenant_id,
            provider_name,
            event.external_call_id,
            event.direction,
            event.from_number,
            event.to_number,
            responsible_user_id,
            event.duration_seconds,
            event.status,
            event.started_at,
            event.ended_at,
        )
        if call is None:
            call = await repository.get_call_by_external_id(conn, provider_name, event.external_call_id)

    if event.recording_url and call["recording_object_key"] is None:
        object_key = f"recordings/{tenant_id}/{call['id']}.mp3"
        try:
            data = await download_recording(event.recording_url)
            await put_object(object_key, data)
        except Exception:
            logger.warning("recording download/upload failed for call %s", call["id"], exc_info=True)
        else:
            async with tenant_connection(pool, tenant_id) as conn:
                await repository.update_call_recording_key(conn, call["id"], object_key)

    async with tenant_connection(pool, tenant_id) as conn:
        await repository.mark_webhook_event_processed(conn, webhook_event["id"])

    return {"status": "processed", "call_id": call["id"]}
