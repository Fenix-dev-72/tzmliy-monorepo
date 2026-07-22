from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"

    # Runtime pool DSN — the FastAPI app connects as this role. It must be a
    # non-owner, NOBYPASSRLS role, otherwise RLS default-deny is silently skipped.
    database_url: str

    # Owner/superuser DSN, used only by db/migrate.py to run DDL and grant
    # privileges to the runtime role. Never used by request-serving code.
    migrations_database_url: str

    # Password for the runtime role, injected into 0001_init.sql when it
    # creates that role. Keep in sync with the password embedded in database_url.
    app_db_password: str

    # optimize.md #24 (2026-07-17): with `--workers 1` in production, this
    # pool is the entire app's DB concurrency ceiling -- max_size=10 meant a
    # 50-request burst queued 40 of them behind just 10 DB connections.
    # Doubled as a conservative bump for the current small shared VPS
    # (Postgres itself is memory-constrained there too); on a larger
    # dedicated DB server (see the capacity-planning discussion) this should
    # go considerably higher, paired with PgBouncer so Postgres's own
    # max_connections isn't exhausted by however many app processes/pools
    # end up running.
    db_pool_min_size: int = 4
    db_pool_max_size: int = 20

    # Scaling-prep (2026-07-18): read-replica routing, wired end-to-end but
    # inert until this is actually set. None (default) means
    # core/database.py's create_replica_pool just reuses the primary pool
    # object -- every "replica" read hits the same single Postgres instance
    # as today, zero behavior change. Once a real read replica exists,
    # setting this DSN in .env alone routes reports/diagnostics and the
    # read-heavy analytics endpoints (leaderboard, revenue-timeseries,
    # course-sales, debt-summary, lead-quality-summary, dashboard summary)
    # onto it -- no further code change needed.
    replica_database_url: str | None = None

    # Scaling-prep (2026-07-18): PgBouncer transaction-pooling mode is
    # incompatible with asyncpg's default per-connection prepared-statement
    # cache (a pooled connection can be handed a different physical Postgres
    # session between transactions, where a previously-prepared statement
    # doesn't exist). None (default) leaves asyncpg's own default behavior
    # untouched -- direct-to-Postgres today. When DATABASE_URL is later
    # pointed at PgBouncer, set this to 0 in .env to disable the cache --
    # again, no code change needed at that point.
    db_statement_cache_size: int | None = None

    # Default asyncio-loop thread pool size (main.py's lifespan) -- bcrypt
    # hash/verify calls run here (see core/security.py). Load-tested
    # 2026-07-14: the stdlib default (~20 threads on a 16-core box) queued
    # concurrent logins far behind actual CPU capacity. Not a security
    # setting (bcrypt cost factor is unchanged) -- purely how many bcrypt
    # calls may run in parallel at once.
    bcrypt_executor_threads: int = 64

    # Ephemeral OTP / password-reset / registration-code storage (see
    # core/redis_client.py) -- these were originally Postgres tables with a
    # manual expires_at column; Redis's native TTL does the same job faster
    # and with automatic cleanup, no cron/vacuum needed. DB index 1, not the
    # default 0 -- on the shared staging VPS, another project may already use
    # Redis's default DB, and this keeps dashboarduz's keys segregated the
    # same way its own Postgres role/database are already isolated from
    # "barisha"'s.
    redis_url: str = "redis://localhost:6379/1"

    # Bounds core/redis_client.py's shared client (rate-limit checks, OTP
    # store) -- see that module's docstring for the load-test finding this
    # fixes. timeout is how long a request queues for a free pooled
    # connection before giving up (raises, surfaced as a 500) rather than
    # opening an unbounded number of raw sockets under a burst.
    redis_pool_max_connections: int = 100
    redis_pool_timeout_seconds: float = 20.0

    # Celery broker (2026-07-12) -- OTP/code delivery (email SMTP + Telegram
    # SMS) moved off the request path into a real background worker
    # (dashboarduz-celery.service), per explicit user request. Reuses the
    # same Redis instance as redis_url but a separate DB index (2, not 1) so
    # keys never collide with otp_store.py's OTP/token storage.
    celery_broker_url: str = "redis://localhost:6379/2"

    # Telegram getUpdates offset per tenant (2026-07-14, notifications->Celery
    # migration) -- was in-process memory in telegram_link_worker.py; Celery
    # tasks have no long-lived process to hold that in, so it moves to Redis,
    # same instance but yet another distinct DB index (3), same segregation
    # convention as redis_url/celery_broker_url above.
    telegram_offset_redis_url: str = "redis://localhost:6379/3"

    # CRM OAuth state (2026-07-15, one-click AmoCRM/Bitrix24/Meta Ads connect)
    # -- short-lived CSRF state for the authorize->callback round trip, same
    # segregation convention as the three Redis DB indexes above (this is 4).
    crm_oauth_state_redis_url: str = "redis://localhost:6379/4"

    # Signs both tenant-user and platform-admin JWTs. A single secret is fine
    # while both live in one process; the "type"/"scope" claim in each token
    # (see core/security.py) is what actually separates the two audiences.
    jwt_secret: str
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30
    platform_access_token_ttl_minutes: int = 15
    platform_refresh_token_ttl_days: int = 7

    password_reset_token_ttl_minutes: int = 30
    otp_code_ttl_minutes: int = 5
    otp_max_attempts: int = 5
    two_factor_pending_ttl_minutes: int = 5

    # Account lockout (brute-force protection): N consecutive failed
    # password/TOTP attempts lock the account for M minutes. Applies to tenant
    # users, platform admins, and dashboards alike; OTP has its own per-code
    # attempt cap (otp_max_attempts). Locked accounts still get a generic 401
    # (per OWASP, never confirm an account exists or is locked).
    login_max_failed_attempts: int = 5
    login_lockout_minutes: int = 15

    # Per-IP sliding-window rate limits (core/middleware.py). Redis-backed
    # (optimize.md #11, 2026-07-14) -- the limit holds across every app
    # process/VPS sharing that Redis instance, not just one.
    rate_limit_enabled: bool = True
    # Credential endpoints (login / OTP / password-reset / 2FA verify).
    rate_limit_auth_requests: int = 10
    rate_limit_auth_window_seconds: int = 60
    # Signed webhooks (calls/billing/CRM) -- higher, providers burst legitimately.
    rate_limit_webhook_requests: int = 120
    rate_limit_webhook_window_seconds: int = 60
    # Every other /api/v1 and /platform/v1 route not already covered by the
    # two buckets above (2026-07-17, explicit request: relying on the login
    # limiter alone doesn't stop a valid, already-issued JWT from being used
    # to flood business endpoints -- an "internal" DoS, not a credential-
    # guessing one). Deliberately generous relative to the auth bucket, since
    # legitimate dashboard usage fires several parallel requests per page.
    rate_limit_general_requests: int = 300
    rate_limit_general_window_seconds: int = 60
    # Only honor X-Forwarded-For when the app actually sits behind a trusted
    # reverse proxy that overwrites it -- otherwise any client can spoof its
    # IP and dodge the limiter.
    trust_x_forwarded_for: bool = False

    # Comma-separated list of allowed browser origins (e.g. the Next.js
    # frontend's URL). Empty = CORS middleware not installed at all; never
    # use "*" -- responses carry credentials.
    cors_allowed_origins: str = ""

    # Fernet key encrypting integration secrets at rest (e.g. calls provider
    # webhook secrets) -- generate with:
    # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    secret_encryption_key: str

    # S3-compatible object storage (call recordings). endpoint_url=None means
    # real AWS S3; set it for MinIO/self-hosted S3-compatible storage.
    object_storage_endpoint_url: str | None = None
    # Presigned GET URLs are handed to the BROWSER, not called by this
    # process -- object_storage_endpoint_url is reachable from inside the
    # backend container/VPS (e.g. the Docker-network hostname "minio"), but
    # that hostname doesn't resolve for an external browser (bug found
    # 2026-07-15: exported report downloads 404'd with
    # DNS_PROBE_FINISHED_NXDOMAIN because the presigned URL embedded
    # "minio:9000"). Defaults to object_storage_endpoint_url for real S3
    # (where the same public endpoint is correct both ways) but should be set
    # separately (e.g. http://localhost:9000 for local Docker dev, or the
    # VPS's public MinIO URL in production) whenever the internal and
    # external hostnames differ.
    object_storage_public_endpoint_url: str | None = None
    object_storage_access_key: str
    object_storage_secret_key: str
    object_storage_bucket: str
    object_storage_region: str = "us-east-1"

    # Platform's own Payme/Click merchant account, collecting SaaS subscription
    # fees from tenants -- platform-level config (like jwt_secret), NOT the
    # per-tenant integration_credentials table (that's each tenant's own UTEL
    # account, a different thing entirely).
    payme_merchant_id: str = ""
    payme_secret_key: str = ""
    click_merchant_id: str = ""
    click_service_id: str = ""
    click_secret_key: str = ""

    # Dunning ladder thresholds (days since the subscription's current_period_end
    # was missed) driving tenants.status transitions in billing/service.py's
    # run_dunning: active -> past_due (immediately) -> grace (after N days) ->
    # suspended (after N more days).
    billing_past_due_grace_days: int = 5
    billing_grace_suspend_days: int = 10

    # Poll interval for the notifications outbox background worker (Faza 9) --
    # the first real background-task loop in this repo (everything before it
    # is on-demand-only, e.g. finance payroll / billing storage-recalculate).
    notification_worker_poll_seconds: int = 30

    # Live Leaderboard SSE poll interval (Faza 10) and dashboard-session JWT
    # TTL -- a dashboard is a persistent kiosk screen, not a human session, so
    # it gets a long-lived access-only token instead of refresh-token rotation.
    analytics_sse_poll_seconds: int = 5
    dashboard_session_ttl_hours: int = 24

    # Meta Ads campaign/insight sync poll interval (Faza 11) -- a second,
    # independent background worker alongside the notifications outbox one.
    # Long interval: ad performance data doesn't need second-by-second polling.
    meta_ads_sync_poll_seconds: int = 21600
    # optimize.md #8 (2026-07-14): sync_meta_ads used to await each tenant one
    # at a time per tick; now runs tenants concurrently, bounded by this
    # semaphore so a large tenant count doesn't open unbounded connections /
    # hammer the Meta Ads API all at once.
    crm_sync_max_concurrency: int = 10

    # optimize.md #24 (2026-07-18): notifications/tasks.py's outbox/schedule
    # dispatch loops and billing/service.py's run_dunning used to await each
    # tenant sequentially -- same "one slow tenant delays everyone else on
    # this tick" issue crm_sync_max_concurrency above already fixed for Meta
    # Ads sync. Reused across all three call sites rather than adding a
    # separate knob per loop.
    tenant_loop_max_concurrency: int = 10

    # AmoCRM calls pull sync (2026-07-15, client requirement: "barcha AmoCRM
    # qo'ng'iroqlari Tizimly'ga tortib olinadi"). Much shorter than Meta
    # Ads' interval above -- calls should show up close to real-time, not
    # once every 6h. A separate asyncio task from sync_meta_ads (one
    # distinct kind of background work = one distinct task, this repo's
    # existing convention), sharing the same crm/worker.py module.
    amocrm_calls_sync_poll_seconds: int = 300

    # One-click OAuth connect for AmoCRM/Bitrix24/Meta Ads (2026-07-15). All
    # default to "" (not configured) -- no real app is registered with any of
    # these three providers yet, so get_oauth_authorize_url raises a clean
    # OAuthNotConfiguredError instead of building a broken authorize URL.
    # Every provider's own OAuth app registration screen must be given
    # exactly f"{oauth_redirect_base_url}/api/v1/crm/oauth/{{provider}}/callback"
    # as its redirect URI -- oauth_redirect_base_url must be this backend's
    # real public HTTPS URL once deployed (OAuth providers reject non-HTTPS
    # redirect URIs in production; http://localhost is only valid for local
    # testing against a fake/sandbox provider).
    oauth_redirect_base_url: str = "http://localhost:8010"
    amocrm_oauth_client_id: str = ""
    amocrm_oauth_client_secret: str = ""
    bitrix24_oauth_client_id: str = ""
    bitrix24_oauth_client_secret: str = ""
    meta_ads_oauth_client_id: str = ""
    meta_ads_oauth_client_secret: str = ""

    # optimize.md #9 (2026-07-14): compute_tenant_db_bytes scans every
    # tenant-scoped table (pg_column_size over ~24 tables) -- recalculate_storage
    # skips redoing that if the latest snapshot is fresher than this many
    # minutes, unless the caller explicitly passes force=true.
    billing_storage_recalc_cache_minutes: int = 60

    # Payroll calculation worker poll interval (2026-07-12 performance pass)
    # -- a third, independent background worker. Short relative to the
    # others: this backs an interactive admin action (click "Hisoblash",
    # expect a near-immediate result), not fire-and-forget delivery.
    finance_payroll_worker_poll_seconds: int = 5

    # Report export (CSV/XLSX) worker poll interval (2026-07-12 performance
    # pass, part 2) -- a fourth independent background worker. Same short
    # interval as payroll: an interactive "Export" click, not fire-and-forget.
    reports_export_worker_poll_seconds: int = 5

    # Personal Telegram-linking poll interval (2026-07-13, self-service
    # employee onboarding) -- a fifth independent background worker. Polls
    # (getUpdates), not a webhook: Telegram's setWebhook requires a public
    # HTTPS URL, which this deployment doesn't have yet (see CLAUDE.md's
    # Deployment section). Short interval, same "interactive, expect a quick
    # result" reasoning as payroll/export.
    telegram_link_worker_poll_seconds: int = 10
    telegram_link_token_ttl_minutes: int = 15

    # optimize.md #10 (2026-07-14): call-recording download+upload moved out
    # of the webhook request into this background worker -- same short-poll
    # reasoning as payroll/export (recordings should show up soon after a
    # call, not fire-and-forget). Gives up (stops retrying) after
    # max_attempts failed downloads for the same recording URL.
    calls_recording_worker_poll_seconds: int = 10
    calls_recording_max_attempts: int = 5

    # Real phone-OTP delivery (core/notify.py's send_code) via Telegram's
    # official Gateway API (core.telegram.org/gateway) -- sends the code as a
    # Telegram message to whatever Telegram account is registered under that
    # phone number, no SMS provider or per-user bot-linking flow needed.
    # Token comes from https://gateway.telegram.org/ account settings. Empty
    # = not configured, send_code falls back to logging only (same graceful-
    # degradation pattern as unconfigured object storage).
    telegram_gateway_api_token: str = ""

    # Real email delivery (core/notify.py's send_code, "email" channel --
    # password reset + registration codes for email identifiers) via SMTP
    # (Gmail: smtp.gmail.com:587 + an App Password, not the account password --
    # Google requires 2-Step Verification enabled to generate one). Empty
    # smtp_username = not configured, falls back to log-only, same
    # graceful-degradation pattern as telegram_gateway_api_token.
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_sender_email: str = ""
    smtp_sender_name: str = "Dashboarduz"

    # Base URL of the deployed frontend SPA -- used to build the clickable
    # password-reset link emailed to users (`/login/reset?identifier=...&token=...`,
    # see NewPasswordView.tsx). Dev default matches the frontend's local Vite
    # port used throughout manual testing; must be swapped for the real public
    # frontend origin once it has one, same "no domain yet" caveat as CORS.
    frontend_base_url: str = "http://localhost:5180"


@lru_cache
def get_settings() -> Settings:
    return Settings()
