from uuid import UUID

import asyncpg

from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.database import tenant_connection
from app.modules.calls import repository as calls_repository
from app.modules.crm import repository
from app.modules.crm.providers import InvalidLeadPayloadError, get_provider
from app.modules.customers import repository as customers_repository


class IntegrationNotConfiguredError(Exception):
    pass


class InvalidWebhookSignatureError(Exception):
    pass


class InvalidWebhookPayloadError(Exception):
    pass


class CustomerNotFoundError(Exception):
    pass


async def configure_amocrm(pool: asyncpg.Pool, tenant_id: UUID, subdomain: str, api_token: str, webhook_secret: str) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.upsert_integration_credential_with_account(
            conn, tenant_id, "amocrm", encrypt_secret(webhook_secret), encrypt_secret(api_token), subdomain
        )


async def configure_bitrix24(pool: asyncpg.Pool, tenant_id: UUID, webhook_base_url: str, application_token: str) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.upsert_integration_credential_with_account(
            conn, tenant_id, "bitrix24", encrypt_secret(application_token), encrypt_secret(webhook_base_url), None
        )


async def configure_meta_ads(pool: asyncpg.Pool, tenant_id: UUID, ad_account_id: str, access_token: str) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.upsert_integration_credential_with_account(
            conn, tenant_id, "meta_ads", None, encrypt_secret(access_token), ad_account_id
        )


async def ingest_webhook(
    pool: asyncpg.Pool, provider_name: str, tenant_id: UUID, raw_body: bytes, headers: dict, query_params: dict
) -> dict:
    """Mirrors calls/service.py's ingest_webhook: verify -> webhook_events
    dedup insert -> resolve/create the customers row -> crm_lead_syncs audit
    row. tenant_id comes from the URL path (webhooks have no authenticated
    caller) -- same narrow, deliberate exception to "tenant_id never from
    client input" as calls' webhook route: the real authentication is the
    signature/token, verified against that tenant's stored secret."""
    provider = get_provider(provider_name)

    async with tenant_connection(pool, tenant_id) as conn:
        credential = await repository.get_active_integration_credential_with_account(conn, provider_name)
        if credential is None:
            raise IntegrationNotConfiguredError
        secret = decrypt_secret(credential["webhook_secret_encrypted"]) if credential["webhook_secret_encrypted"] else None
        if not provider.verify_webhook(headers, query_params, raw_body, secret):
            # Not persisted -- same anti-DoS reasoning as calls' webhook:
            # an attacker can put any tenant_id in the URL, so unauthenticated
            # payloads must never reach webhook_events.
            raise InvalidWebhookSignatureError

        try:
            event = provider.parse_lead_event(raw_body, headers.get("content-type", ""))
        except InvalidLeadPayloadError as exc:
            raise InvalidWebhookPayloadError from exc

        claimed = await calls_repository.claim_webhook_event(conn, tenant_id, provider_name, event.external_lead_id)
        if not claimed:
            return {"status": "duplicate"}
        webhook_event = await calls_repository.insert_webhook_event(
            conn, tenant_id, provider_name, event.external_lead_id, {"raw": raw_body.decode("utf-8", errors="replace")}, True
        )

        customer = await customers_repository.get_customer_by_phone(conn, event.phone)
        if customer is None:
            customer = await customers_repository.insert_customer(conn, tenant_id, event.full_name, event.phone, None, "lead")
            if customer is None:
                customer = await customers_repository.get_customer_by_phone(conn, event.phone)

        sync_row = await repository.insert_crm_lead_sync(
            conn,
            tenant_id,
            customer["id"],
            provider_name,
            event.external_lead_id,
            "inbound",
            {"full_name": event.full_name, "phone": event.phone, "email": event.email},
        )

    return {"status": "processed", "customer_id": customer["id"], "sync_id": sync_row["id"]}


async def push_customer_to_crm(pool: asyncpg.Pool, tenant_id: UUID, customer_id: UUID, provider_name: str) -> dict:
    provider = get_provider(provider_name)

    async with tenant_connection(pool, tenant_id) as conn:
        customer = await customers_repository.get_customer_by_id(conn, customer_id)
        if customer is None:
            raise CustomerNotFoundError
        credential = await repository.get_active_integration_credential_with_account(conn, provider_name)
        if credential is None:
            raise IntegrationNotConfiguredError
        decrypted_credential = dict(credential)
        if credential["api_key_encrypted"]:
            decrypted_credential["api_key_encrypted"] = decrypt_secret(credential["api_key_encrypted"])

    # Outside any transaction -- slow external I/O shouldn't hold a DB
    # connection open, same principle as calls' recording download.
    external_lead_id = await provider.push_lead(decrypted_credential, customer)

    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.insert_crm_lead_sync(conn, tenant_id, customer_id, provider_name, external_lead_id, "outbound", None)


async def list_lead_syncs(pool: asyncpg.Pool, tenant_id: UUID) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_crm_lead_syncs(conn)


async def list_ad_campaigns(pool: asyncpg.Pool, tenant_id: UUID) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_ad_campaigns(conn)


async def list_ad_insights(pool: asyncpg.Pool, tenant_id: UUID, campaign_id: UUID | None) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_ad_insights(conn, campaign_id)
