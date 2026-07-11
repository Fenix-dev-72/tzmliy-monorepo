"""Meta Ads campaign/daily-insight sync -- a second, independent background
worker alongside notifications/worker.py's outbox loop (one distinct kind of
background work = one distinct asyncio task, not a shared tick doing
unrelated things). Started/cancelled in main.py's lifespan the same way.
"""

import logging
from asyncio import sleep
from datetime import date, timedelta

import asyncpg

from app.core.config import Settings
from app.core.crypto import decrypt_secret
from app.core.database import platform_connection, tenant_connection
from app.modules.crm import meta_ads, repository
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


async def sync_meta_ads(pool: asyncpg.Pool) -> None:
    async with platform_connection(pool) as conn:
        tenants = await tenants_repository.list_tenants(conn)
    for tenant in tenants:
        await _sync_tenant_meta_ads(pool, tenant["id"])


async def run_forever(pool: asyncpg.Pool, settings: Settings) -> None:
    logger.info("crm worker starting, poll interval=%ss", settings.meta_ads_sync_poll_seconds)
    while True:
        try:
            await sync_meta_ads(pool)
        except Exception:
            logger.exception("crm worker tick failed")
        await sleep(settings.meta_ads_sync_poll_seconds)
