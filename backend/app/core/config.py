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

    db_pool_min_size: int = 2
    db_pool_max_size: int = 10

    # Ephemeral OTP / password-reset / registration-code storage (see
    # core/redis_client.py) -- these were originally Postgres tables with a
    # manual expires_at column; Redis's native TTL does the same job faster
    # and with automatic cleanup, no cron/vacuum needed. DB index 1, not the
    # default 0 -- on the shared staging VPS, another project may already use
    # Redis's default DB, and this keeps dashboarduz's keys segregated the
    # same way its own Postgres role/database are already isolated from
    # "barisha"'s.
    redis_url: str = "redis://localhost:6379/1"

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

    # Per-IP sliding-window rate limits (core/rate_limit.py). Distributed via
    # Redis when available, otherwise in-memory per-process fallback.
    rate_limit_enabled: bool = True
    rate_limit_auth_requests: int = 10
    rate_limit_auth_window_seconds: int = 60
    rate_limit_webhook_requests: int = 120
    rate_limit_webhook_window_seconds: int = 60
    rate_limit_general_requests: int = 200
    rate_limit_general_window_seconds: int = 60
    trust_x_forwarded_for: bool = False

    # Redis cache settings (core/cache.py)
    cache_default_ttl_seconds: int = 300
    cache_enabled: bool = True

    # Structured logging (core/logging.py)
    log_json_format: bool = False
    log_level: str = "INFO"

    # Prometheus metrics (core/metrics.py)
    metrics_enabled: bool = True

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
