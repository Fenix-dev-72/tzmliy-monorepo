import asyncio
import contextlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import get_settings
from app.core.logging import setup_structured_logging

_settings = get_settings()
setup_structured_logging(json_format=_settings.log_json_format)

import logging

from app.core.cache import RedisCache
from app.core.database import create_pool
from app.core.metrics import APP_INFO, MetricsMiddleware, metrics_endpoint
from app.core.rate_limit import DistributedRateLimitMiddleware
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
from app.modules.calls.router import router as calls_router
from app.modules.catalog.router import router as catalog_router
from app.modules.crm import worker as crm_worker
from app.modules.crm.router import router as crm_router
from app.modules.customers.router import router as customers_router
from app.modules.finance.router import router as finance_router
from app.modules.notifications import worker as notifications_worker
from app.modules.notifications.router import router as notifications_router
from app.modules.reports.router import router as reports_router
from app.modules.sales.router import router as sales_router
from app.modules.tenants.router import router as tenants_router

logger = logging.getLogger("dashboarduz.main")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    app.state.pool = await create_pool(settings)
    app.state.redis = await create_redis_pool(settings)
    app.state.cache = RedisCache(app.state.redis, default_ttl=settings.cache_default_ttl_seconds)

    APP_INFO.info({"version": "1.0.0", "environment": settings.app_env})

    app.state.notification_worker_task = asyncio.create_task(
        notifications_worker.run_forever(app.state.pool, settings)
    )
    app.state.crm_sync_worker_task = asyncio.create_task(
        crm_worker.run_forever(app.state.pool, settings)
    )

    logger.info("Application startup complete")

    try:
        yield
    finally:
        logger.info("Application shutting down")
        app.state.notification_worker_task.cancel()
        app.state.crm_sync_worker_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await app.state.notification_worker_task
        with contextlib.suppress(asyncio.CancelledError):
            await app.state.crm_sync_worker_task
        await app.state.redis.aclose()
        await app.state.pool.close()


app = FastAPI(title="Dashboarduz", lifespan=lifespan)

# Middleware order (last added = outermost):
# RequestLogging -> Metrics -> RateLimit -> CORS -> SecurityHeaders
if _settings.metrics_enabled:
    app.add_middleware(MetricsMiddleware)

app.add_middleware(
    DistributedRateLimitMiddleware,
    settings=_settings,
    redis_client=None,  # Will be set after lifespan starts
)

if _settings.cors_allowed_origins:
    from fastapi.middleware.cors import CORSMiddleware

    if _settings.cors_allowed_origins.strip() == "*":
        app.add_middleware(
            CORSMiddleware,
            allow_origin_regex=".*",
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    else:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=[
                origin.strip()
                for origin in _settings.cors_allowed_origins.split(",")
                if origin.strip()
            ],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

from app.core.logging import RequestLoggingMiddleware
from app.core.middleware import SecurityHeadersMiddleware

app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(SecurityHeadersMiddleware, settings=_settings)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(roles_router)
app.include_router(catalog_router)
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

if _settings.metrics_enabled:
    app.add_route("/metrics", metrics_endpoint, methods=["GET"])


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/health/db")
async def health_db() -> dict:
    async with app.state.pool.acquire() as conn:
        await conn.fetchval("SELECT 1")
    return {"status": "ok"}


@app.get("/health/redis")
async def health_redis() -> dict:
    try:
        await app.state.redis.ping()
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@app.get("/health/cache")
async def health_cache() -> dict:
    try:
        await app.state.cache.set("health_check", {"test": True}, ttl=10)
        value = await app.state.cache.get("health_check")
        await app.state.cache.delete("health_check")
        if value and value.get("test") is True:
            return {"status": "ok"}
        return {"status": "error", "detail": "Cache read/write mismatch"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}
