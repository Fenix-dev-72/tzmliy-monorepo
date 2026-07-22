import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import FastAPI

logging.basicConfig(level=logging.INFO)

from app.core.config import get_settings
from app.core.database import create_pool, create_replica_pool
from app.core.middleware import RateLimitMiddleware, SecurityHeadersMiddleware
from app.core.redis_client import create_redis_pool
from app.modules.analytics.router import dashboard_router as analytics_dashboard_router
from app.modules.analytics.router import router as analytics_router
from app.modules.attendance.router import router as attendance_router
from app.modules.auth.roles_router import router as roles_router
from app.modules.auth.router import router as auth_router
from app.modules.auth.users_router import router as users_router
from app.modules.billing.router import platform_router as billing_platform_router
from app.modules.billing.router import tenant_router as billing_tenant_router
from app.modules.billing.router import webhook_router as billing_webhook_router
from app.modules.calls import recording_worker as calls_recording_worker
from app.modules.calls.router import router as calls_router
from app.modules.catalog.router import router as catalog_router
from app.modules.complaints.router import platform_router as complaints_platform_router
from app.modules.complaints.router import tenant_router as complaints_tenant_router
from app.modules.crm import worker as crm_worker
from app.modules.crm.router import router as crm_router
from app.modules.customers.router import router as customers_router
from app.modules.finance import payroll_worker
from app.modules.finance.router import router as finance_router
from app.modules.notifications.router import router as notifications_router
from app.modules.platform_dashboard.router import router as platform_dashboard_router
from app.modules.products.router import router as products_router
from app.modules.reports import export_worker as reports_export_worker
from app.modules.reports.router import router as reports_router
from app.modules.sales.router import router as sales_router
from app.modules.tenants.router import router as tenants_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    # bcrypt (core/security.py's hash_password/verify_password) runs via
    # asyncio.to_thread, which uses this loop's default executor -- Python's
    # own default (min(32, cpu_count+4)) caps concurrent password
    # verification well below what a 16-core box can actually run in
    # parallel (measured 2026-07-14 load test: 3000 concurrent logins queued
    # behind only 20 threads, ~30s p50 latency). Bumping thread count doesn't
    # change bcrypt's per-call CPU cost, but it stops the pool itself from
    # being the artificial bottleneck ahead of the real CPU ceiling.
    asyncio.get_event_loop().set_default_executor(ThreadPoolExecutor(max_workers=settings.bcrypt_executor_threads))
    app.state.pool = await create_pool(settings)
    # Scaling-prep (2026-07-18): app.state.replica_pool is the exact same
    # object as app.state.pool until replica_database_url is configured --
    # see create_replica_pool's own docstring.
    app.state.replica_pool = await create_replica_pool(settings, app.state.pool)
    app.state.redis = await create_redis_pool(settings)
    # Notifications (outbox delivery, schedule dispatch, group-link polling)
    # moved off asyncio.create_task onto Celery + Beat (2026-07-14) -- see
    # app/modules/notifications/tasks.py and app/core/celery_app.py's
    # beat_schedule. Run `celery -A app.core.celery_app worker` and
    # `celery -A app.core.celery_app beat` alongside uvicorn for that module's
    # background work to actually happen.
    app.state.crm_sync_worker_task = asyncio.create_task(crm_worker.run_forever(app.state.pool, settings, app.state.redis))
    # AmoCRM calls pull sync (2026-07-15) -- a separate task from the Meta Ads
    # loop above (one distinct kind of background work = one distinct task,
    # this repo's existing convention), since it needs a much shorter poll
    # interval (calls should show up close to real-time, not once every 6h).
    app.state.amocrm_calls_sync_worker_task = asyncio.create_task(
        crm_worker.run_forever_amocrm_calls(app.state.pool, settings, app.state.redis)
    )
    app.state.payroll_worker_task = asyncio.create_task(payroll_worker.run_forever(app.state.pool, settings))
    app.state.reports_export_worker_task = asyncio.create_task(reports_export_worker.run_forever(app.state.pool, settings))
    app.state.calls_recording_worker_task = asyncio.create_task(calls_recording_worker.run_forever(app.state.pool, settings))
    try:
        yield
    finally:
        app.state.crm_sync_worker_task.cancel()
        app.state.amocrm_calls_sync_worker_task.cancel()
        app.state.payroll_worker_task.cancel()
        app.state.reports_export_worker_task.cancel()
        app.state.calls_recording_worker_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await app.state.crm_sync_worker_task
        with contextlib.suppress(asyncio.CancelledError):
            await app.state.amocrm_calls_sync_worker_task
        with contextlib.suppress(asyncio.CancelledError):
            await app.state.payroll_worker_task
        with contextlib.suppress(asyncio.CancelledError):
            await app.state.reports_export_worker_task
        with contextlib.suppress(asyncio.CancelledError):
            await app.state.calls_recording_worker_task
        await app.state.redis.aclose()
        # Only close replica_pool separately if it's a genuinely distinct
        # pool -- closing the same asyncpg.Pool object twice raises.
        if app.state.replica_pool is not app.state.pool:
            await app.state.replica_pool.close()
        await app.state.pool.close()


app = FastAPI(title="Dashboarduz", lifespan=lifespan)

_settings = get_settings()
# add_middleware: last added = outermost. Innermost-to-outermost here is
# RateLimit -> CORS -> SecurityHeaders, so CORS preflights are answered
# without burning rate-limit budget, and every response — including the
# limiter's own 429s — still gets the security headers. CORS only when
# origins are explicitly configured.
#
# CORS_ALLOWED_ORIGINS="*" is a deliberate, temporary escape hatch (staging,
# frontend origin not finalized yet) -- a literal `allow_origins=["*"]`
# doesn't actually work once allow_credentials=True (browsers reject the
# combination per the Fetch spec), so "*" is special-cased here to
# allow_origin_regex=".*", which reflects whatever Origin sent the request
# instead of a static list. Swap CORS_ALLOWED_ORIGINS to a real comma-
# separated origin list (e.g. "https://app.dashboarduz.uz") once the
# frontend's real domain is known -- never leave "*" set for real tenant data.
app.add_middleware(RateLimitMiddleware, settings=_settings)
if _settings.cors_allowed_origins:
    from fastapi.middleware.cors import CORSMiddleware

    if _settings.cors_allowed_origins.strip() == "*":
        app.add_middleware(CORSMiddleware, allow_origin_regex=".*", allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
    else:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=[origin.strip() for origin in _settings.cors_allowed_origins.split(",") if origin.strip()],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
app.add_middleware(SecurityHeadersMiddleware, settings=_settings)
# optimize.md #25 (2026-07-17) -- list endpoints (calls/customers/sales) can
# return sizeable JSON arrays with no compression at all today. Starlette's
# GZipMiddleware auto-excludes `text/event-stream` (confirmed via its
# DEFAULT_EXCLUDED_CONTENT_TYPES, installed version 1.3.1), so this is safe
# alongside the leaderboard/CRM-leads SSE streams -- no special-casing needed.
from starlette.middleware.gzip import GZipMiddleware

app.add_middleware(GZipMiddleware, minimum_size=1000)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(roles_router)
app.include_router(catalog_router)
app.include_router(products_router)
app.include_router(tenants_router)
app.include_router(customers_router)
app.include_router(sales_router)
app.include_router(finance_router)
app.include_router(calls_router)
app.include_router(attendance_router)
app.include_router(billing_tenant_router)
app.include_router(billing_platform_router)
app.include_router(billing_webhook_router)
app.include_router(notifications_router)
app.include_router(analytics_router)
app.include_router(analytics_dashboard_router)
app.include_router(crm_router)
app.include_router(reports_router)
app.include_router(platform_dashboard_router)
app.include_router(complaints_tenant_router)
app.include_router(complaints_platform_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/health/db")
async def health_db() -> dict:
    async with app.state.pool.acquire() as conn:
        await conn.fetchval("SELECT 1")
    return {"status": "ok"}
