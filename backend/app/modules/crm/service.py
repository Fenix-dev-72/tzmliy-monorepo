import json
import secrets
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from uuid import UUID

import asyncpg
import redis.asyncio as redis

from app.core.config import get_settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.database import tenant_connection
from app.modules.calls import repository as calls_repository
from app.modules.crm import oauth as crm_oauth
from app.modules.crm import repository
from app.modules.crm.providers import CrmApiError, get_provider
from app.modules.customers import repository as customers_repository
from app.modules.finance import repository as finance_repository
from app.modules.finance import service as finance_service
from app.modules.sales import repository as sales_repository
from app.modules.sales import service as sales_service

_OAUTH_STATE_TTL_SECONDS = 600


class IntegrationNotConfiguredError(Exception):
    pass


class CustomerNotFoundError(Exception):
    pass


class UserNotFoundError(Exception):
    pass


class OAuthNotConfiguredError(Exception):
    """Raised when a provider's client_id/client_secret settings are still
    the default empty string -- no real OAuth app registered yet."""

    pass


class InvalidOAuthStateError(Exception):
    pass


class OAuthDomainRequiredError(Exception):
    pass


_OAUTH_CLIENT_SETTINGS = {
    "amocrm": ("amocrm_oauth_client_id", "amocrm_oauth_client_secret"),
    "bitrix24": ("bitrix24_oauth_client_id", "bitrix24_oauth_client_secret"),
    "meta_ads": ("meta_ads_oauth_client_id", "meta_ads_oauth_client_secret"),
}


@lru_cache
def _oauth_state_redis() -> redis.Redis:
    return redis.from_url(get_settings().crm_oauth_state_redis_url, decode_responses=True)


_CIRCUIT_OPEN_TTL_SECONDS = 300  # 5 minutes
_CIRCUIT_KEY_PREFIX = "crm_circuit_open:"


async def _circuit_is_open(tenant_id: UUID, provider: str) -> bool:
    """Circuit breaker (2026-07-18, found via a 100k-request load test): the
    three provider.* call sites below (push_customer_to_crm,
    list_manager_candidates, get_seller_followup_stats) all go through
    providers.py's urllib call with timeout=15 -- fine for one request, but
    with no fast-fail, EVERY call against an unconfigured/stale-credential
    integration pays that same real 7-15s network round trip. Under load,
    real-world testing measured these categories dropping to ~96% success
    with a 7-11s p95, dragging down the whole run's aggregate latency. This
    reuses the same lightweight Redis client _oauth_state_redis() already
    keeps cached for this module, just under a different key prefix -- no
    new connection, no new setting."""
    r = _oauth_state_redis()
    return bool(await r.exists(f"{_CIRCUIT_KEY_PREFIX}{tenant_id}:{provider}"))


async def _circuit_record_failure(tenant_id: UUID, provider: str) -> None:
    r = _oauth_state_redis()
    await r.set(f"{_CIRCUIT_KEY_PREFIX}{tenant_id}:{provider}", "1", ex=_CIRCUIT_OPEN_TTL_SECONDS)


async def _circuit_record_success(tenant_id: UUID, provider: str) -> None:
    # Clears an open circuit the moment the integration actually works again
    # -- no reason to make a just-fixed integration wait out the full TTL.
    r = _oauth_state_redis()
    await r.delete(f"{_CIRCUIT_KEY_PREFIX}{tenant_id}:{provider}")


def _oauth_client_credentials(provider: str) -> tuple[str, str]:
    id_field, secret_field = _OAUTH_CLIENT_SETTINGS[provider]
    settings = get_settings()
    client_id, client_secret = getattr(settings, id_field), getattr(settings, secret_field)
    if not client_id or not client_secret:
        raise OAuthNotConfiguredError(provider)
    return client_id, client_secret


def _oauth_redirect_uri(provider: str) -> str:
    return f"{get_settings().oauth_redirect_base_url}/api/v1/crm/oauth/{provider}/callback"


async def configure_amocrm(pool: asyncpg.Pool, tenant_id: UUID, subdomain: str, api_token: str) -> dict:
    # webhook_secret_encrypted is None here -- AmoCRM no longer has a webhook
    # path at all (2026-07-24, see providers.py's module docstring), so a
    # manually-pasted long-lived token needs no secret generated for it.
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.upsert_integration_credential_with_account(
            conn, tenant_id, "amocrm", None, encrypt_secret(api_token), subdomain
        )


async def configure_meta_ads(pool: asyncpg.Pool, tenant_id: UUID, ad_account_id: str, access_token: str) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.upsert_integration_credential_with_account(
            conn, tenant_id, "meta_ads", None, encrypt_secret(access_token), ad_account_id
        )


async def list_integrations(pool: asyncpg.Pool, tenant_id: UUID) -> list[dict]:
    """Backs GET /crm/integrations -- lets IntegrationsPage know which
    providers are already connected on a fresh page load, not just right
    after a same-session configure/connect (found 2026-07-15: the frontend
    had no way to learn this at all, so a real, successful OAuth connection
    still showed as "not connected" after any page reload)."""
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_integration_credentials(conn)


async def disconnect_integration(pool: asyncpg.Pool, tenant_id: UUID, provider: str) -> None:
    """Soft-deactivates a connected provider (2026-07-17) -- the row is kept
    (not deleted) so a later reconnect can still COALESCE-preserve whatever
    the existing row already has for a credential that's merely inactive."""
    async with tenant_connection(pool, tenant_id) as conn:
        await repository.deactivate_integration_credential(conn, provider)


async def get_oauth_authorize_url(tenant_id: UUID, user_id: UUID, provider: str, domain: str | None = None) -> str:
    """"1 tugma bilan ulash" (2026-07-15). Raises OAuthNotConfiguredError until
    a real client_id/secret is registered with the provider and set via env
    vars -- callers should surface that as a clear "not available yet"
    message, not a broken redirect. State is a single-use, 10-minute-TTL
    Redis entry (not a DB table) -- same short-lived-CSRF-token shape as
    password reset's token_urlsafe, just Redis-backed like the OTP store
    instead of a dedicated table, since this needs no audit trail."""
    # amocrm's authorize step is domain-agnostic (see oauth.py's
    # build_authorize_url) -- only bitrix24's authorize host is actually
    # subdomain-specific, so only it needs the portal domain upfront.
    if provider == "bitrix24" and not domain:
        raise OAuthDomainRequiredError(provider)
    client_id, _ = _oauth_client_credentials(provider)

    state = secrets.token_urlsafe(32)
    payload = {"tenant_id": str(tenant_id), "user_id": str(user_id), "provider": provider, "domain": domain}
    await _oauth_state_redis().set(f"oauth_state:{state}", json.dumps(payload), ex=_OAUTH_STATE_TTL_SECONDS)

    redirect_uri = _oauth_redirect_uri(provider)
    return crm_oauth.build_authorize_url(provider, client_id, redirect_uri, state, domain)


async def complete_oauth(pool: asyncpg.Pool, provider: str, code: str, state: str, callback_domain: str | None = None) -> UUID:
    """Callback side of get_oauth_authorize_url -- returns the tenant_id so
    the router can build the right redirect-back-to-frontend URL. The state
    key is popped (GETDEL) so a replayed/reused callback URL can't
    re-trigger the exchange.

    callback_domain -- for amocrm, the account subdomain isn't known until
    the provider's own callback tells us (its `referer` param, parsed by
    router.py) since the authorize step is domain-agnostic; takes priority
    over any domain collected upfront (bitrix24 still supplies that upfront
    and passes None here)."""
    raw = await _oauth_state_redis().getdel(f"oauth_state:{state}")
    if raw is None:
        raise InvalidOAuthStateError
    payload = json.loads(raw)
    if payload["provider"] != provider:
        raise InvalidOAuthStateError
    tenant_id = UUID(payload["tenant_id"])
    domain = callback_domain or payload.get("domain")

    client_id, client_secret = _oauth_client_credentials(provider)
    redirect_uri = _oauth_redirect_uri(provider)
    token_data = await crm_oauth.exchange_code(provider, client_id, client_secret, code, redirect_uri, domain)

    expires_at = None
    if token_data.get("expires_in"):
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=token_data["expires_in"])

    # webhook_secret_encrypted is always None now -- neither AmoCRM nor
    # Bitrix24 has a webhook path at all anymore (2026-07-24, see
    # providers.py's module docstring), so nothing needs one generated at
    # connect time.
    async with tenant_connection(pool, tenant_id) as conn:
        await repository.upsert_oauth_integration_credential(
            conn,
            tenant_id,
            provider,
            encrypt_secret(token_data["access_token"]),
            token_data.get("account_domain") or domain,
            encrypt_secret(token_data["refresh_token"]) if token_data.get("refresh_token") else None,
            expires_at,
            webhook_secret_encrypted=None,
        )
    return tenant_id


async def _get_valid_credential(conn: asyncpg.Connection, tenant_id: UUID, provider: str) -> dict | None:
    """Fetches an active credential and, if it's OAuth-connected
    (token_expires_at is set) and expired, refreshes it and persists the new
    tokens before returning. Manually-pasted (non-OAuth) credentials have
    token_expires_at IS NULL, so this is a pure passthrough for them --
    push_customer_to_crm/get_seller_followup_stats call this instead of
    reading the row directly so an OAuth-connected integration keeps working
    past its first token expiry instead of silently failing with a stale
    access token."""
    credential = await repository.get_active_integration_credential_with_account(conn, provider)
    if credential is None:
        return None
    if credential["token_expires_at"] is None or credential["token_expires_at"] > datetime.now(timezone.utc):
        return credential
    if not credential["refresh_token_encrypted"]:
        return credential  # expired with nothing to refresh with -- let the caller's own API call fail naturally

    try:
        client_id, client_secret = _oauth_client_credentials(provider)
    except OAuthNotConfiguredError:
        # Bug fix (2026-07-18, found via full-API-surface load test): this
        # function's own signature/docstring promise `dict | None`, never an
        # exception -- both callers (push_customer_to_crm,
        # get_seller_followup_stats) only wrap CrmApiError/None, so an
        # unconfigured platform-level OAuth app (client_id/secret still
        # blank) was reaching them as a raw unhandled 500 instead of the
        # documented "let the caller's own API call fail naturally" fallback
        # already used two lines above for a missing refresh_token.
        return credential
    redirect_uri = _oauth_redirect_uri(provider)
    refresh_token = decrypt_secret(credential["refresh_token_encrypted"])
    try:
        token_data = await crm_oauth.refresh_access_token(
            provider, client_id, client_secret, refresh_token, redirect_uri, credential["external_account_id"]
        )
    except CrmApiError:
        # e.g. meta_ads has no refresh grant at all -- fall back to the
        # stale credential rather than crash; the caller's own API call will
        # fail naturally if the token has truly expired.
        return credential

    new_expires_at = datetime.now(timezone.utc) + timedelta(seconds=token_data["expires_in"]) if token_data.get("expires_in") else None
    await repository.update_integration_credential_tokens(
        conn,
        tenant_id,
        provider,
        encrypt_secret(token_data["access_token"]),
        encrypt_secret(token_data.get("refresh_token", refresh_token)),
        new_expires_at,
    )
    credential = dict(credential)
    credential["api_key_encrypted"] = encrypt_secret(token_data["access_token"])
    credential["token_expires_at"] = new_expires_at
    return credential


_AMOCRM_WON_STATUS_ID = "142"
_AMOCRM_LOST_STATUS_ID = "143"
# Client requirement (2026-07-15): the tenant's own custom "To'lov qabul
# qilindi" pipeline stage should also record a full payment -- unlike
# _AMOCRM_WON_STATUS_ID/_AMOCRM_LOST_STATUS_ID (reserved, identical across
# every AmoCRM account), a CUSTOM stage's status_id is account-specific by
# nature (confirmed live via GET /api/v4/leads/pipelines against this
# tenant's own connected account). Hardcoded for this one tenant/account for
# now; a real per-tenant "map your own stage to an action" setting would be
# needed before this can work for any other AmoCRM-connected tenant.
_AMOCRM_PAYMENT_RECEIVED_STATUS_ID = "87175562"
_DEFAULT_SALE_DEADLINE_DAYS = 30


async def _sync_sale_price(
    pool: asyncpg.Pool, tenant_id: UUID, sale: dict, new_price_amount: int, actor_user_id: UUID
) -> dict:
    """Brings a CRM-linked sale's price_amount (and the ledger balance that
    backs "Qoldiq") in line with the deal's current price in AmoCRM. Skips
    silently on a version conflict (someone edited the sale in Tizimly at
    the same moment) or once the sale is already terminal (completed/
    cancelled sales' price is frozen, same invariant sales/service.py's own
    update_sale enforces) -- best-effort sync, not strongly consistent, same
    trade-off as this module's other CRM-driven status updates."""
    if sale["status"] in ("completed", "cancelled"):
        return sale
    delta = new_price_amount - sale["price_amount"]
    try:
        updated = await sales_service.apply_tariff_change(
            pool, tenant_id, sale["id"], actor_user_id, new_price_amount, None, sale["version"], "AmoCRM narxi yangilandi"
        )
    except (sales_service.SaleVersionConflictError, sales_service.SaleNotFoundError):
        return sale
    async with tenant_connection(pool, tenant_id) as conn:
        await finance_repository.insert_ledger_entry(
            conn,
            tenant_id,
            sale["id"],
            sale["customer_id"],
            "adjustment",
            delta,
            sale["currency"],
            None,
            None,
            "AmoCRM narxi yangilangani uchun tuzatish",
            actor_user_id,
        )
    return updated


async def _record_full_payment_if_owed(
    pool: asyncpg.Pool, tenant_id: UUID, sale: dict, actor_user_id: UUID, idempotency_key: str
) -> None:
    """Shared by the Won and payment-received status branches below --
    records the sale's full remaining ledger balance as a payment.
    Idempotent on its own key (derived from the sale's own idempotency_key),
    so a repeated webhook for the same transition never double-posts; a
    balance of 0 (already fully paid, e.g. a duplicate transition) is a
    no-op, not an error."""
    async with tenant_connection(pool, tenant_id) as conn:
        balance = await finance_repository.get_ledger_balance_by_sale(conn, sale["id"])
    if balance > 0:
        await finance_service.record_payment(
            pool, tenant_id, actor_user_id, sale["id"], balance, sale["currency"], "manual", idempotency_key
        )


async def ingest_amocrm_lead(pool: asyncpg.Pool, tenant_id: UUID, provider, event, responsible_user_id: UUID | None) -> dict:
    """Called by crm/worker.py's sync_amocrm_leads (2026-07-24, client
    decision: AmoCRM no longer has a webhook path at all -- webhook delivery
    was never guaranteed, and a lead created before the integration was ever
    connected would never fire one anyway, see providers.py's module
    docstring). Driven by a ParsedLeadEvent built from a periodic
    `filter[updated_at][from]` pull. Bitrix24's counterpart, further below,
    is deliberately narrower (see ingest_bitrix24_lead's own docstring) --
    the two aren't shared since AmoCRM's won/lost/price-sync handling below
    doesn't apply to Bitrix24 at all.

    No webhook_events dedup needed -- that table exists specifically to make
    a *retried delivery* of the same webhook a no-op; re-processing the same
    lead on a later pull tick is already safe on its own via
    customer-by-phone and sale-by-idempotency-key lookups below, same
    idempotency shape as calls' insert_call ON CONFLICT DO NOTHING."""
    phone = event.phone
    if phone is None and hasattr(provider, "fetch_lead_phone"):
        fresh_credential = await get_valid_credential_for_sync(pool, tenant_id, "amocrm")
        if fresh_credential is not None:
            decrypted_credential = dict(fresh_credential)
            if fresh_credential["api_key_encrypted"]:
                decrypted_credential["api_key_encrypted"] = decrypt_secret(fresh_credential["api_key_encrypted"])
            phone = await provider.fetch_lead_phone(decrypted_credential, event.external_lead_id)

    async with tenant_connection(pool, tenant_id) as conn:
        customer = await customers_repository.get_customer_by_phone(conn, phone) if phone else None
        if customer is None:
            customer = await customers_repository.insert_customer(
                conn, tenant_id, event.full_name, phone, responsible_user_id, "lead", "amocrm"
            )
            if customer is None:
                customer = await customers_repository.get_customer_by_phone(conn, phone)

        sync_row = await repository.insert_crm_lead_sync(
            conn,
            tenant_id,
            customer["id"],
            "amocrm",
            event.external_lead_id,
            "inbound",
            {"full_name": event.full_name, "phone": phone, "email": event.email},
        )

    if event.status_id == _AMOCRM_LOST_STATUS_ID:
        is_unreachable = phone is None
        if not is_unreachable:
            async with tenant_connection(pool, tenant_id) as conn:
                is_unreachable = await calls_repository.customer_has_missed_call(conn, phone)
        quality = "low_quality" if is_unreachable else "unrated"
        lost_reason = None
        if hasattr(provider, "fetch_loss_reason"):
            fresh_credential = await get_valid_credential_for_sync(pool, tenant_id, "amocrm")
            if fresh_credential is not None:
                decrypted_credential = dict(fresh_credential)
                if fresh_credential["api_key_encrypted"]:
                    decrypted_credential["api_key_encrypted"] = decrypt_secret(fresh_credential["api_key_encrypted"])
                lost_reason = await provider.fetch_loss_reason(decrypted_credential, event.external_lead_id)
        if lost_reason is None:
            lost_reason = "no_phone" if phone is None else ("no_answer" if is_unreachable else None)
        async with tenant_connection(pool, tenant_id) as conn:
            await customers_repository.update_customer_crm_outcome(conn, customer["id"], "lost", quality, lost_reason)

    sale_id = None
    if responsible_user_id is not None:
        sale_idempotency_key = f"crm:amocrm:{event.external_lead_id}"
        async with tenant_connection(pool, tenant_id) as conn:
            existing_sale = await sales_repository.get_sale_by_idempotency_key(conn, sale_idempotency_key)
        if existing_sale is None:
            sale, is_new = await sales_service.create_sale(
                pool,
                tenant_id,
                customer["id"],
                None,
                responsible_user_id,
                "UZS",
                event.price_amount or 0,
                datetime.now(timezone.utc) + timedelta(days=_DEFAULT_SALE_DEADLINE_DAYS),
                sale_idempotency_key,
                None,
                "amocrm",
            )
            sale_id = sale["id"]
            if is_new:
                await finance_service.post_charge(
                    pool, tenant_id, sale["id"], customer["id"], sale["price_amount"], sale["currency"], responsible_user_id
                )
        else:
            sale_id = existing_sale["id"]
            if event.price_amount is not None and event.price_amount != existing_sale["price_amount"]:
                existing_sale = await _sync_sale_price(pool, tenant_id, existing_sale, event.price_amount, responsible_user_id)
            if event.status_id == _AMOCRM_WON_STATUS_ID:
                await sales_service.update_sale_status_from_crm(pool, tenant_id, sale_idempotency_key, "completed")
                await _record_full_payment_if_owed(
                    pool, tenant_id, existing_sale, responsible_user_id, f"{sale_idempotency_key}:won-payment"
                )
                async with tenant_connection(pool, tenant_id) as conn:
                    await customers_repository.update_customer_crm_outcome(conn, customer["id"], "customer", "quality", None)
            elif event.status_id == _AMOCRM_LOST_STATUS_ID:
                await sales_service.update_sale_status_from_crm(pool, tenant_id, sale_idempotency_key, "cancelled")
            elif event.status_id == _AMOCRM_PAYMENT_RECEIVED_STATUS_ID:
                await _record_full_payment_if_owed(
                    pool, tenant_id, existing_sale, responsible_user_id, f"{sale_idempotency_key}:payment-received"
                )

    return {"status": "processed", "customer_id": customer["id"], "sync_id": sync_row["id"], "sale_id": sale_id}


async def ingest_bitrix24_lead(pool: asyncpg.Pool, tenant_id: UUID, event, responsible_user_id: UUID | None) -> dict:
    """Pull-based counterpart to ingest_amocrm_lead above, called by
    crm/worker.py's sync_bitrix24_leads (2026-07-24, same client decision --
    Bitrix24 no longer has a webhook path at all either, see providers.py's
    module docstring). Deliberately narrower than ingest_amocrm_lead: no
    won/lost transition or price-sync handling, since Bitrix24's STATUS_ID
    values are portal-specific custom pipeline stages, not a universal
    reserved code like AmoCRM's 142/143 -- attempting to auto-detect
    won/lost without a per-tenant "map your own stage" setting (which
    doesn't exist yet) would guess wrong as often as right. This matches
    this integration's pre-existing scope: the old webhook path never
    actually triggered that logic for Bitrix24 either, since the AmoCRM
    status-id constants it checked against never matched Bitrix24 events.

    Phone comes directly from Bitrix24Provider.list_leads (no separate
    fetch_lead_phone follow-up call needed, unlike AmoCRM) -- Bitrix24's
    crm.lead.list response carries PHONE inline. No webhook_events dedup
    needed either, same reasoning as ingest_amocrm_lead: customer-by-phone
    and sale-by-idempotency-key lookups below already make re-processing the
    same lead on a later pull tick safe."""
    async with tenant_connection(pool, tenant_id) as conn:
        customer = await customers_repository.get_customer_by_phone(conn, event.phone) if event.phone else None
        if customer is None:
            customer = await customers_repository.insert_customer(
                conn, tenant_id, event.full_name, event.phone, responsible_user_id, "lead", "bitrix24"
            )
            if customer is None:
                customer = await customers_repository.get_customer_by_phone(conn, event.phone)

        sync_row = await repository.insert_crm_lead_sync(
            conn,
            tenant_id,
            customer["id"],
            "bitrix24",
            event.external_lead_id,
            "inbound",
            {"full_name": event.full_name, "phone": event.phone, "email": event.email},
        )

    sale_id = None
    if responsible_user_id is not None:
        sale_idempotency_key = f"crm:bitrix24:{event.external_lead_id}"
        async with tenant_connection(pool, tenant_id) as conn:
            existing_sale = await sales_repository.get_sale_by_idempotency_key(conn, sale_idempotency_key)
        if existing_sale is None:
            sale, is_new = await sales_service.create_sale(
                pool,
                tenant_id,
                customer["id"],
                None,
                responsible_user_id,
                "UZS",
                event.price_amount or 0,
                datetime.now(timezone.utc) + timedelta(days=_DEFAULT_SALE_DEADLINE_DAYS),
                sale_idempotency_key,
                None,
                "bitrix24",
            )
            sale_id = sale["id"]
            if is_new:
                await finance_service.post_charge(
                    pool, tenant_id, sale["id"], customer["id"], sale["price_amount"], sale["currency"], responsible_user_id
                )
        else:
            sale_id = existing_sale["id"]
            if event.price_amount is not None and event.price_amount != existing_sale["price_amount"]:
                await _sync_sale_price(pool, tenant_id, existing_sale, event.price_amount, responsible_user_id)

    return {"status": "processed", "customer_id": customer["id"], "sync_id": sync_row["id"], "sale_id": sale_id}


async def push_customer_to_crm(pool: asyncpg.Pool, tenant_id: UUID, customer_id: UUID, provider_name: str) -> dict:
    provider = get_provider(provider_name)

    async with tenant_connection(pool, tenant_id) as conn:
        customer = await customers_repository.get_customer_by_id(conn, customer_id)
        if customer is None:
            raise CustomerNotFoundError
        credential = await _get_valid_credential(conn, tenant_id, provider_name)
        if credential is None:
            raise IntegrationNotConfiguredError
        decrypted_credential = dict(credential)
        if credential["api_key_encrypted"]:
            decrypted_credential["api_key_encrypted"] = decrypt_secret(credential["api_key_encrypted"])

    if await _circuit_is_open(tenant_id, provider_name):
        raise CrmApiError("Circuit open: recent calls to this CRM failed, skipping network call")

    # Outside any transaction -- slow external I/O shouldn't hold a DB
    # connection open, same principle as calls' recording download.
    try:
        external_lead_id = await provider.push_lead(decrypted_credential, customer)
    except CrmApiError:
        await _circuit_record_failure(tenant_id, provider_name)
        raise
    await _circuit_record_success(tenant_id, provider_name)

    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.insert_crm_lead_sync(conn, tenant_id, customer_id, provider_name, external_lead_id, "outbound", None)


async def get_valid_credential_for_sync(pool: asyncpg.Pool, tenant_id: UUID, provider: str) -> dict | None:
    """Public wrapper around _get_valid_credential for callers outside this
    module's own tenant_connection block -- crm/worker.py's AmoCRM calls
    sync (2026-07-15) needs the same auto-refreshing OAuth credential fetch
    push_customer_to_crm/list_manager_candidates already use, but from a
    background-task context that doesn't have a connection open yet."""
    async with tenant_connection(pool, tenant_id) as conn:
        return await _get_valid_credential(conn, tenant_id, provider)


async def list_manager_candidates(pool: asyncpg.Pool, tenant_id: UUID, provider_name: str) -> list[dict]:
    """Self-service manager-mapping (CompleteSetupPage, 2026-07-15): fetches
    the connected CRM's real user list so an employee picks their own name
    from a dropdown instead of typing a raw external id by hand -- the
    "asking for the ID repeatedly is not good" complaint. Returns [] (not an
    error) when nothing is configured yet, same graceful-degradation shape
    as everywhere else an unconfigured integration is treated as "nothing to
    show" rather than a hard failure."""
    provider = get_provider(provider_name)
    async with tenant_connection(pool, tenant_id) as conn:
        credential = await _get_valid_credential(conn, tenant_id, provider_name)
        if credential is None:
            return []
        decrypted_credential = dict(credential)
        if credential["api_key_encrypted"]:
            decrypted_credential["api_key_encrypted"] = decrypt_secret(credential["api_key_encrypted"])

    if await _circuit_is_open(tenant_id, provider_name):
        return []

    try:
        result = await provider.list_users(decrypted_credential)
    except CrmApiError:
        await _circuit_record_failure(tenant_id, provider_name)
        return []
    await _circuit_record_success(tenant_id, provider_name)
    return result


async def list_lead_syncs(pool: asyncpg.Pool, tenant_id: UUID) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_crm_lead_syncs(conn)


async def create_manager_mapping(
    pool: asyncpg.Pool, tenant_id: UUID, provider: str, external_manager_id: str, user_id: UUID
) -> dict:
    async with tenant_connection(pool, tenant_id) as conn:
        if not await repository.user_exists(conn, user_id):
            raise UserNotFoundError
        row = await repository.insert_crm_manager_mapping(conn, tenant_id, provider, external_manager_id, user_id)
        if row is None:
            row = await repository.get_crm_manager_mapping_by_external_id(conn, provider, external_manager_id)
        return row


async def create_own_manager_mapping(
    pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID, provider: str, external_manager_id: str
) -> dict:
    """Self-service counterpart -- user_id always the caller's own token,
    same split as calls/service.py's create_own_manager_mapping."""
    return await create_manager_mapping(pool, tenant_id, provider, external_manager_id, user_id)


async def list_manager_mappings(pool: asyncpg.Pool, tenant_id: UUID) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_crm_manager_mappings(conn)


async def user_has_manager_mapping(pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID) -> bool:
    """Used by auth/service.py's pending_links computation."""
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.user_has_crm_manager_mapping(conn, user_id)


async def get_seller_followup_stats(
    pool: asyncpg.Pool, tenant_id: UUID, user_id: UUID, period_start: datetime, period_end: datetime
) -> dict | None:
    """Per-seller KPI page's Follow-up metric (2026-07-13) -- pulls this
    seller's own CRM follow-up tasks live from their connected AmoCRM/Bitrix24
    account (not an in-house task tracker, per explicit product decision).
    Returns None if the seller hasn't linked a CRM identity yet, or if the
    live external call fails (bad/expired credential) -- both are "can't
    show this metric" states the caller renders as a placeholder, never a
    500 for the whole KPI page over one external provider hiccup."""
    async with tenant_connection(pool, tenant_id) as conn:
        mapping = await repository.get_crm_manager_mapping_by_user(conn, user_id)
        if mapping is None:
            return None
        credential = await _get_valid_credential(conn, tenant_id, mapping["provider"])
        if credential is None:
            return None
        decrypted = dict(credential)
        if credential["api_key_encrypted"]:
            decrypted["api_key_encrypted"] = decrypt_secret(credential["api_key_encrypted"])

    if await _circuit_is_open(tenant_id, mapping["provider"]):
        return None

    # Outside the transaction -- slow external I/O shouldn't hold a DB
    # connection open, same principle as calls' recording download and
    # crm's own push_customer_to_crm.
    provider = get_provider(mapping["provider"])
    try:
        tasks = await provider.list_tasks(decrypted, mapping["external_manager_id"], period_start, period_end)
    except CrmApiError:
        await _circuit_record_failure(tenant_id, mapping["provider"])
        return None
    await _circuit_record_success(tenant_id, mapping["provider"])

    if not tasks:
        return {"total": 0, "on_time": 0, "pct": None}
    on_time = sum(1 for t in tasks if t["on_time"])
    return {"total": len(tasks), "on_time": on_time, "pct": round(on_time / len(tasks) * 100, 1)}


async def list_ad_campaigns(pool: asyncpg.Pool, tenant_id: UUID) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_ad_campaigns(conn)


async def list_ad_insights(pool: asyncpg.Pool, tenant_id: UUID, campaign_id: UUID | None) -> list[dict]:
    async with tenant_connection(pool, tenant_id) as conn:
        return await repository.list_ad_insights(conn, campaign_id)
