"""Meta Ads campaign/daily-insight sync -- a second, independent background
worker alongside notifications/worker.py's outbox loop (one distinct kind of
background work = one distinct asyncio task, not a shared tick doing
unrelated things). Started/cancelled in main.py's lifespan the same way.
"""

import asyncio
import logging
from asyncio import sleep
from datetime import date, datetime, timedelta, timezone

import asyncpg

from app.core.config import Settings
from app.core.crypto import decrypt_secret
from app.core.database import platform_connection, tenant_connection
from app.modules.calls import repository as calls_repository
from app.modules.crm import meta_ads, repository, service
from app.modules.crm.providers import CrmApiError, get_provider
from app.modules.tenants import repository as tenants_repository

logger = logging.getLogger("dashboarduz.crm.worker")


async def _sync_tenant_meta_ads(pool: asyncpg.Pool, tenant_id) -> None:
    async with tenant_connection(pool, tenant_id) as conn:
        credential = await repository.get_active_integration_credential_with_account(conn, "meta_ads")
    if credential is None:
        return

    access_token = decrypt_secret(credential["api_key_encrypted"])
    ad_account_id = credential["external_account_id"]

    try:
        campaigns = await meta_ads.list_campaigns(access_token, ad_account_id)
    except meta_ads.MetaAdsApiError:
        logger.warning("meta ads campaign fetch failed for tenant %s", tenant_id, exc_info=True)
        return

    today = date.today()
    since = today - timedelta(days=7)

    campaign_insights = []
    for campaign in campaigns:
        try:
            insights = await meta_ads.get_campaign_insights(access_token, campaign["id"], since, today)
        except meta_ads.MetaAdsApiError:
            logger.warning("meta ads insights fetch failed for campaign %s", campaign["id"], exc_info=True)
            insights = []
        campaign_insights.append((campaign, insights))

    async with tenant_connection(pool, tenant_id) as conn:
        for campaign, insights in campaign_insights:
            row = await repository.upsert_ad_campaign(
                conn, tenant_id, "meta_ads", campaign["id"], campaign.get("name", ""), campaign.get("status", "UNKNOWN")
            )
            for insight in insights:
                # Meta reports spend as a decimal string in the ad account's
                # own currency; stored as an integer minor-unit amount here
                # (matching the project's no-float money convention). Account
                # currency should be read from the ad account in a fuller
                # implementation -- hardcoded USD is a known simplification.
                spend_amount = round(float(insight.get("spend", 0)) * 100)
                await repository.upsert_ad_insight(
                    conn,
                    tenant_id,
                    row["id"],
                    date.fromisoformat(insight["date_start"]),
                    int(insight.get("impressions", 0)),
                    int(insight.get("clicks", 0)),
                    spend_amount,
                    "USD",
                )


_LOCK_TTL_SECONDS = 300  # generous vs. this worker's 6h poll interval -- only
# there to bound how long a crashed worker can hold a lock, not a real budget.


async def sync_meta_ads(pool: asyncpg.Pool, settings: Settings, redis_client) -> None:
    async with platform_connection(pool) as conn:
        tenants = await tenants_repository.list_tenants(conn)

    # optimize.md #8: was a sequential `for tenant in tenants: await ...` loop
    # -- one slow/unresponsive tenant's Meta Ads calls delayed every other
    # tenant's sync on the same tick. Each tenant gets its own
    # tenant_connection (a distinct pool connection), so running them
    # concurrently is safe; bounded by a semaphore so a large tenant count
    # doesn't open unbounded connections or hammer the Meta Ads API at once.
    semaphore = asyncio.Semaphore(settings.crm_sync_max_concurrency)

    async def _sync_with_limit(tenant_id) -> None:
        # No job-queue table here (unlike payroll/export/calls' claim_*), so
        # multi-worker safety (2026-07-14) instead uses a short-lived Redis
        # lock per tenant -- without it, more than one app process (uvicorn
        # --workers, multiple VPS) firing the same tick together would double
        # the Meta Ads API calls (rate-limit risk) and duplicate
        # ad_campaigns/ad_insights upserts (harmless, idempotent, but still
        # wasted external calls).
        lock_key = f"lock:crm_sync:{tenant_id}"
        acquired = await redis_client.set(lock_key, "1", nx=True, ex=_LOCK_TTL_SECONDS)
        if not acquired:
            return
        async with semaphore:
            try:
                await _sync_tenant_meta_ads(pool, tenant_id)
            except Exception:
                logger.exception("meta ads sync failed for tenant %s", tenant_id)
            finally:
                await redis_client.delete(lock_key)

    await asyncio.gather(*(_sync_with_limit(tenant["id"]) for tenant in tenants))


async def run_forever(pool: asyncpg.Pool, settings: Settings, redis_client) -> None:
    logger.info("crm worker starting, poll interval=%ss", settings.meta_ads_sync_poll_seconds)
    while True:
        try:
            await sync_meta_ads(pool, settings, redis_client)
        except Exception:
            logger.exception("crm worker tick failed")
        await sleep(settings.meta_ads_sync_poll_seconds)


async def _sync_tenant_amocrm_calls(pool: asyncpg.Pool, tenant_id, since: datetime) -> None:
    credential = await service.get_valid_credential_for_sync(pool, tenant_id, "amocrm")
    if credential is None:
        return
    decrypted_credential = dict(credential)
    if credential["api_key_encrypted"]:
        decrypted_credential["api_key_encrypted"] = decrypt_secret(credential["api_key_encrypted"])

    try:
        calls = await get_provider("amocrm").list_calls(decrypted_credential, since)
    except CrmApiError:
        logger.warning("amocrm calls fetch failed for tenant %s", tenant_id, exc_info=True)
        return

    async with tenant_connection(pool, tenant_id) as conn:
        # optimize.md #21 (2026-07-17): this used to issue one
        # get_crm_manager_mapping_by_external_id query per call in the loop
        # below (N+1) -- bulk-fetch every amocrm mapping for this tenant once
        # instead and look up in a dict, same "batch it once, not per-row"
        # fix already applied to finance/service.py's payroll calculation.
        mappings_by_external_id = {
            m["external_manager_id"]: m["user_id"]
            for m in await repository.list_crm_manager_mappings(conn)
            if m["provider"] == "amocrm" and m["is_active"]
        }
        for c in calls:
            responsible_user_id = mappings_by_external_id.get(c["external_agent_id"]) if c["external_agent_id"] else None

            call = await calls_repository.insert_call(
                conn,
                tenant_id,
                "amocrm",
                c["external_call_id"],
                c["direction"],
                c["from_number"],
                c["to_number"],
                responsible_user_id,
                c["duration_seconds"],
                c["status"],
                c["started_at"],
                c["ended_at"],
            )
            if call is None:
                call = await calls_repository.get_call_by_external_id(conn, "amocrm", c["external_call_id"])
            # Recording download happens out-of-band via calls_recording_worker.py
            # (the same claim-based worker already used for UTEL/Мои звонки),
            # not inline here -- a slow/unavailable recording URL shouldn't
            # delay ingesting the rest of this tick's calls.
            if c["recording_url"] and call["recording_object_key"] is None:
                await calls_repository.set_pending_recording_url(conn, call["id"], c["recording_url"])


async def sync_amocrm_calls(pool: asyncpg.Pool, settings: Settings, redis_client) -> None:
    async with platform_connection(pool) as conn:
        tenants = await tenants_repository.list_tenants(conn)

    # Generous lookback window vs. the poll interval -- a tick that ran late
    # (worker restart, one slow tenant) still re-covers any gap instead of
    # silently skipping calls that landed in between. insert_call's
    # ON CONFLICT DO NOTHING makes re-fetching the same window on every tick
    # harmless, same idempotency shape as Meta Ads' campaign/insight upserts.
    since = datetime.now(timezone.utc) - timedelta(seconds=settings.amocrm_calls_sync_poll_seconds * 3)

    semaphore = asyncio.Semaphore(settings.crm_sync_max_concurrency)

    async def _sync_with_limit(tenant_id) -> None:
        lock_key = f"lock:amocrm_calls_sync:{tenant_id}"
        acquired = await redis_client.set(lock_key, "1", nx=True, ex=_LOCK_TTL_SECONDS)
        if not acquired:
            return
        async with semaphore:
            try:
                await _sync_tenant_amocrm_calls(pool, tenant_id, since)
            except Exception:
                logger.exception("amocrm calls sync failed for tenant %s", tenant_id)
            finally:
                await redis_client.delete(lock_key)

    await asyncio.gather(*(_sync_with_limit(tenant["id"]) for tenant in tenants))


async def run_forever_amocrm_calls(pool: asyncpg.Pool, settings: Settings, redis_client) -> None:
    logger.info("amocrm calls sync worker starting, poll interval=%ss", settings.amocrm_calls_sync_poll_seconds)
    while True:
        try:
            await sync_amocrm_calls(pool, settings, redis_client)
        except Exception:
            logger.exception("amocrm calls sync worker tick failed")
        await sleep(settings.amocrm_calls_sync_poll_seconds)


async def _sync_tenant_amocrm_leads(pool: asyncpg.Pool, tenant_id, since: datetime) -> None:
    """Pull-based lead sync (2026-07-24, client decision -- replaces AmoCRM's
    webhook entirely, see providers.py's module docstring and
    crm/service.py's ingest_amocrm_lead). Mirrors
    _sync_tenant_amocrm_calls' shape above almost exactly, down to the
    "generous lookback window vs. poll interval" idempotency argument in
    sync_amocrm_leads below."""
    credential = await service.get_valid_credential_for_sync(pool, tenant_id, "amocrm")
    if credential is None:
        return
    decrypted_credential = dict(credential)
    if credential["api_key_encrypted"]:
        decrypted_credential["api_key_encrypted"] = decrypt_secret(credential["api_key_encrypted"])

    provider = get_provider("amocrm")
    try:
        leads = await provider.list_leads(decrypted_credential, since)
    except CrmApiError:
        logger.warning("amocrm leads fetch failed for tenant %s", tenant_id, exc_info=True)
        return

    async with tenant_connection(pool, tenant_id) as conn:
        # Same N+1-avoidance fix as _sync_tenant_amocrm_calls above -- one
        # bulk fetch of this tenant's amocrm manager mappings, not one query
        # per lead in the loop below.
        mappings_by_external_id = {
            m["external_manager_id"]: m["user_id"]
            for m in await repository.list_crm_manager_mappings(conn)
            if m["provider"] == "amocrm" and m["is_active"]
        }

    for event in leads:
        responsible_user_id = (
            mappings_by_external_id.get(event.responsible_manager_id) if event.responsible_manager_id else None
        )
        try:
            await service.ingest_amocrm_lead(pool, tenant_id, provider, event, responsible_user_id)
        except Exception:
            # One bad lead (e.g. a transient sale-version conflict) shouldn't
            # abort the rest of this tenant's batch -- same "log and move on"
            # resilience as _sync_tenant_meta_ads' per-campaign try/except.
            logger.exception("amocrm lead ingest failed for tenant %s lead %s", tenant_id, event.external_lead_id)


async def sync_amocrm_leads(pool: asyncpg.Pool, settings: Settings, redis_client) -> None:
    async with platform_connection(pool) as conn:
        tenants = await tenants_repository.list_tenants(conn)

    # Same "generous lookback window, idempotent re-fetch is harmless" shape
    # as sync_amocrm_calls above -- a late/slow tick still re-covers any gap
    # instead of silently skipping leads that changed in between. Safe here
    # because ingest_amocrm_lead is idempotent throughout (customer-by-phone,
    # sale-by-idempotency-key), same as insert_call's ON CONFLICT DO NOTHING.
    since = datetime.now(timezone.utc) - timedelta(seconds=settings.amocrm_leads_sync_poll_seconds * 3)

    semaphore = asyncio.Semaphore(settings.crm_sync_max_concurrency)

    async def _sync_with_limit(tenant_id) -> None:
        lock_key = f"lock:amocrm_leads_sync:{tenant_id}"
        acquired = await redis_client.set(lock_key, "1", nx=True, ex=_LOCK_TTL_SECONDS)
        if not acquired:
            return
        async with semaphore:
            try:
                await _sync_tenant_amocrm_leads(pool, tenant_id, since)
            except Exception:
                logger.exception("amocrm leads sync failed for tenant %s", tenant_id)
            finally:
                await redis_client.delete(lock_key)

    await asyncio.gather(*(_sync_with_limit(tenant["id"]) for tenant in tenants))


async def run_forever_amocrm_leads(pool: asyncpg.Pool, settings: Settings, redis_client) -> None:
    logger.info("amocrm leads sync worker starting, poll interval=%ss", settings.amocrm_leads_sync_poll_seconds)
    while True:
        try:
            await sync_amocrm_leads(pool, settings, redis_client)
        except Exception:
            logger.exception("amocrm leads sync worker tick failed")
        await sleep(settings.amocrm_leads_sync_poll_seconds)


async def _sync_tenant_bitrix24_leads(pool: asyncpg.Pool, tenant_id, since: datetime) -> None:
    """Pull-based lead sync for Bitrix24 (2026-07-24, same client decision as
    AmoCRM's own -- replaces Bitrix24's webhook entirely, see providers.py's
    module docstring and crm/service.py's ingest_bitrix24_lead). Mirrors
    _sync_tenant_amocrm_leads above almost exactly."""
    credential = await service.get_valid_credential_for_sync(pool, tenant_id, "bitrix24")
    if credential is None:
        return
    decrypted_credential = dict(credential)
    if credential["api_key_encrypted"]:
        decrypted_credential["api_key_encrypted"] = decrypt_secret(credential["api_key_encrypted"])

    provider = get_provider("bitrix24")
    try:
        leads = await provider.list_leads(decrypted_credential, since)
    except CrmApiError:
        logger.warning("bitrix24 leads fetch failed for tenant %s", tenant_id, exc_info=True)
        return

    async with tenant_connection(pool, tenant_id) as conn:
        mappings_by_external_id = {
            m["external_manager_id"]: m["user_id"]
            for m in await repository.list_crm_manager_mappings(conn)
            if m["provider"] == "bitrix24" and m["is_active"]
        }

    for event in leads:
        responsible_user_id = (
            mappings_by_external_id.get(event.responsible_manager_id) if event.responsible_manager_id else None
        )
        try:
            await service.ingest_bitrix24_lead(pool, tenant_id, event, responsible_user_id)
        except Exception:
            logger.exception("bitrix24 lead ingest failed for tenant %s lead %s", tenant_id, event.external_lead_id)


async def sync_bitrix24_leads(pool: asyncpg.Pool, settings: Settings, redis_client) -> None:
    async with platform_connection(pool) as conn:
        tenants = await tenants_repository.list_tenants(conn)

    since = datetime.now(timezone.utc) - timedelta(seconds=settings.bitrix24_leads_sync_poll_seconds * 3)
    semaphore = asyncio.Semaphore(settings.crm_sync_max_concurrency)

    async def _sync_with_limit(tenant_id) -> None:
        lock_key = f"lock:bitrix24_leads_sync:{tenant_id}"
        acquired = await redis_client.set(lock_key, "1", nx=True, ex=_LOCK_TTL_SECONDS)
        if not acquired:
            return
        async with semaphore:
            try:
                await _sync_tenant_bitrix24_leads(pool, tenant_id, since)
            except Exception:
                logger.exception("bitrix24 leads sync failed for tenant %s", tenant_id)
            finally:
                await redis_client.delete(lock_key)

    await asyncio.gather(*(_sync_with_limit(tenant["id"]) for tenant in tenants))


async def run_forever_bitrix24_leads(pool: asyncpg.Pool, settings: Settings, redis_client) -> None:
    logger.info("bitrix24 leads sync worker starting, poll interval=%ss", settings.bitrix24_leads_sync_poll_seconds)
    while True:
        try:
            await sync_bitrix24_leads(pool, settings, redis_client)
        except Exception:
            logger.exception("bitrix24 leads sync worker tick failed")
        await sleep(settings.bitrix24_leads_sync_poll_seconds)
