import json
import secrets
from uuid import UUID

import asyncpg

from app.core.config import get_settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.database import tenant_connection
from app.core.storage import presigned_get_url
from app.modules.calls import moi_zvonki_client, repository, utel_client
from app.modules.calls.providers import get_provider


class InvalidSignatureError(Exception):
    pass


class IntegrationNotConfiguredError(Exception):
    pass


class UtelLoginError(Exception):
    pass


class MoiZvonkiConnectError(Exception):
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


async def disconnect_integration(pool: asyncpg.Pool, tenant_id: UUID, provider: str) -> None:
    """Soft-deactivates a connected provider (2026-07-17) -- mirrors
    crm/service.py's disconnect_integration; the row is kept (not deleted)
    so a reconnect can still reuse the existing webhook secret."""
    async with tenant_connection(pool, tenant_id) as conn:
        await repository.deactivate_integration_credential(conn, provider)


async def quick_connect_utel(pool: asyncpg.Pool, tenant_id: UUID, subdomain: str, email: str, password: str) -> dict:
    """Real "1 tugma bilan ulash" for UTEL (2026-07-17) -- unlike
    quick_connect_integration below (which only generates a secret for the
    admin to paste into a provider's own dashboard by hand), this logs into
    UTEL's real API with the tenant's own credentials and registers our
    webhook URL automatically via utel_client.register_webhook, so no manual
    dashboard step is needed at all. `subdomain` is the per-company code
    from that tenant's own UTEL dashboard URL (e.g. "cc341" for
    https://cc341.utel.uz) -- UTEL has no shared API host, each company's
    real API lives at https://api.{subdomain}.utel.uz (see utel_client.py's
    module docstring for how this was discovered), so it's stored as
    external_account_id (same slot AmoCRM's subdomain uses) for future
    reference/reconnects. The network calls run outside any open transaction
    (mirrors ingest_webhook's own two-phase shape below) so a slow UTEL
    response doesn't hold a DB connection open; email/password are never
    persisted, only used for this one login call."""
    async with tenant_connection(pool, tenant_id) as conn:
        existing = await repository.get_active_integration_credential_with_account(conn, "utel")
    secret = decrypt_secret(existing["webhook_secret_encrypted"]) if existing else secrets.token_urlsafe(24)
    webhook_url = f"{get_settings().oauth_redirect_base_url}/api/v1/calls/webhooks/utel/{tenant_id}?secret={secret}"
    try:
        bearer_token = await utel_client.login(subdomain, email, password)
        await utel_client.register_webhook(subdomain, bearer_token, webhook_url)
    except utel_client.InvalidUtelSubdomainError as exc:
        raise UtelLoginError("Noto'g'ri UTEL subdomeni -- faqat harflar, raqamlar va chiziqcha bo'lishi mumkin") from exc
    except utel_client.UtelApiError as exc:
        raise UtelLoginError(str(exc)) from exc
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.upsert_integration_credential_with_account(
            conn, tenant_id, "utel", encrypt_secret(secret), None, subdomain.strip().lower()
        )


async def quick_connect_moi_zvonki(pool: asyncpg.Pool, tenant_id: UUID, domain: str, user_name: str, api_key: str) -> dict:
    """Real "1 tugma bilan ulash" for "Мои звонки" (2026-07-17, confirmed
    against its live API docs). Unlike UTEL, this provider has no login
    endpoint at all -- authentication is a pre-existing api_key the tenant
    copies from their own account settings (Настройки -> Интеграция) paired
    with their account email (user_name). Registers our webhook URL for the
    call.finish event only via moi_zvonki_client.subscribe_webhook (see its
    docstring for why not call.start/call.answer too), so the tenant never
    has to open Мои звонки's own webhook UI. api_key is persisted
    (encrypted, in api_key_encrypted) since -- unlike UTEL's short-lived
    bearer token -- it's a long-lived credential the tenant manages
    themselves; domain is stored as external_account_id, same slot UTEL's
    subdomain uses."""
    async with tenant_connection(pool, tenant_id) as conn:
        existing = await repository.get_active_integration_credential_with_account(conn, "moi_zvonki")
    secret = decrypt_secret(existing["webhook_secret_encrypted"]) if existing else secrets.token_urlsafe(24)
    webhook_url = f"{get_settings().oauth_redirect_base_url}/api/v1/calls/webhooks/moi_zvonki/{tenant_id}?secret={secret}"
    try:
        await moi_zvonki_client.subscribe_webhook(domain, user_name, api_key, webhook_url)
    except moi_zvonki_client.InvalidMoiZvonkiDomainError as exc:
        raise MoiZvonkiConnectError("Noto'g'ri domen -- faqat harflar, raqamlar va chiziqcha bo'lishi mumkin") from exc
    except moi_zvonki_client.MoiZvonkiApiError as exc:
        raise MoiZvonkiConnectError(str(exc)) from exc
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.upsert_integration_credential_with_account(
            conn, tenant_id, "moi_zvonki", encrypt_secret(secret), encrypt_secret(api_key), domain.strip().lower()
        )


async def get_webhook_info(pool: asyncpg.Pool, tenant_id: UUID, provider: str) -> tuple[str, str]:
    """Surfaces the tenant's own inbound webhook URL + HMAC secret so an
    admin/employee can paste both into UTEL/Мои звонки's own webhook config
    without needing DB access to decrypt webhook_secret_encrypted themselves
    -- same "retrievable anytime, not shown once" convention as
    crm/service.py's get_webhook_url."""
    async with tenant_connection(pool, tenant_id) as conn:
        credential = await repository.get_active_integration_credential(conn, provider)
        if credential is None:
            raise IntegrationNotConfiguredError
        secret = decrypt_secret(credential["webhook_secret_encrypted"])
    base_url = get_settings().oauth_redirect_base_url
    webhook_url = f"{base_url}/api/v1/calls/webhooks/{provider}/{tenant_id}"
    return webhook_url, secret


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


async def create_own_manager_mapping(
    pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID, provider: str, external_agent_id: str
) -> dict:
    """Self-service counterpart to create_manager_mapping -- user_id always
    comes from the caller's own token (see router), never request input, same
    split as attendance's check-in vs. admin-only push."""
    return await create_manager_mapping(pool, tenant_id, provider, external_agent_id, user_id)


async def list_manager_mappings(pool: asyncpg.Pool, tenant_id: UUID) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_manager_mappings(conn)


async def user_has_manager_mapping(pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID) -> bool:
    """Used by auth/service.py's pending_links computation -- does not raise,
    a bare existence check."""
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.user_has_manager_mapping(conn, user_id)


def _assert_owned_or_view_all(call: dict, caller_id: UUID, can_view_all: bool) -> None:
    """Own-data scoping (2026-07-22): 404, not 403, for a call the caller
    doesn't own and lacks calls.view_all for -- see customers/service.py's
    identically-named helper for the full rationale."""
    if can_view_all:
        return
    if call["responsible_user_id"] == caller_id:
        return
    raise CallNotFoundError


async def list_calls(
    pool: asyncpg.Pool, tenant_id: UUID, caller_id: UUID, can_view_all: bool, limit: int = 50, offset: int = 0
) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_calls(conn, caller_id, can_view_all, limit, offset)


async def get_call(pool: asyncpg.Pool, tenant_id: UUID, call_id: UUID, caller_id: UUID, can_view_all: bool) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        call = await repository.get_call_by_id(conn, call_id)
    if call is None:
        raise CallNotFoundError
    _assert_owned_or_view_all(call, caller_id, can_view_all)
    return call


async def get_recording_url(
    pool: asyncpg.Pool, tenant_id: UUID, call_id: UUID, caller_id: UUID, can_view_all: bool
) -> str:
    async with tenant_connection(pool, tenant_id) as conn:
        call = await repository.get_call_by_id(conn, call_id)
    if call is None:
        raise CallNotFoundError
    _assert_owned_or_view_all(call, caller_id, can_view_all)
    if call["recording_object_key"] is None:
        raise RecordingNotAvailableError
    return await presigned_get_url(call["recording_object_key"])


async def ingest_webhook(
    pool: asyncpg.Pool, provider_name: str, tenant_id: UUID, raw_body: bytes, headers: dict, query_params: dict
) -> dict:
    """optimize.md #10: previously downloaded+uploaded the recording inline,
    inside the webhook request itself -- a slow/unresponsive provider
    recording endpoint directly slowed down webhook processing. Now just
    records pending_recording_url on the call row (same transaction as the
    rest of the webhook write) and returns; calls/recording_worker.py (an
    asyncio.create_task loop, same convention as payroll/export/CRM) does the
    actual download+upload off the request path.

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
        if not provider.verify_signature(raw_body, headers, query_params, secret):
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
            await repository.set_pending_recording_url(conn, call["id"], event.recording_url)

    async with tenant_connection(pool, tenant_id) as conn:
        await repository.mark_webhook_event_processed(conn, webhook_event["id"])

    return {"status": "processed", "call_id": call["id"]}
