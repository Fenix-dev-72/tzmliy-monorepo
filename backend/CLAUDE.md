# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Dashboarduz — a multi-tenant SaaS (sales, finance, customers, calls, CRM integrations) built as a modular monolith on FastAPI. See the `dashboarduz-*` memory entries for the full product spec; this file covers only what's needed to work in the repo day to day. `FRONTEND.md` covers the same codebase from the frontend integrator's angle (page → API mapping, auth sequences, cross-API dependencies) — update it alongside this file when routes/permissions/auth flows change.

## Faza reja

No separate written phase-plan document exists from the user — this numbering was constructed by Claude from the TZ (full text saved in the `dashboarduz-tz-full` memory) on 2026-07-07, anchored to the phase numbers already referenced in code/migration comments (1, 2, 3, 9, 10, 14) and filling the gaps (4-8, 11-13) in the TZ section 5 module order. Treat this as the working roadmap, not a confirmed external spec — update it if the user provides a different official numbering.

| Faza | Modul/ish | Holat |
|---|---|---|
| 1 | Auth (login/parol, telefon OTP, refresh session, parolni tiklash, opt-in 2FA) | ✅ Bajarilgan |
| 2 | RBAC (roles/role_permissions, granular permission katalog, Platform Admin 2FA+audit log) + privileged permission'lar uchun majburiy 2FA | ✅ Bajarilgan |
| 3 | Catalog (dinamik, cheksiz chuqurlikdagi mahsulot/xizmat ierarxiyasi) | ✅ Bajarilgan |
| 4 | Customers/CRM (mijozlar, lead stage, mas'ul menejer, telefon dedup, CRM tarixi — `crm_activities`) | ✅ Bajarilgan |
| 5 | Sales (savdo shartnomasi, narx/muddat/holat, optimistic concurrency, `sale_changes` tarixi) | ✅ Bajarilgan |
| 6 | Finance (to'lovlar, append-only ledger, refund/tarif-almashtirish approval workflow, bonus/KPI/payroll, Idempotency-Key barcha moliyaviy POST'larda) | ✅ Bajarilgan |
| 7 | Calls (UTEL, Мои звонки integratsiyasi, qo'ng'iroq yozuvlari, davomat, manager mapping) | ✅ Bajarilgan |
| 8 | Billing / Platform SaaS to'lovi (uchta tarif, Click/Payme, subscription holatlari, storage limit) — `finance` moduli bilan aralashtirilmasin, u tenant ichidagi mijoz to'lovlari uchun | ✅ Bajarilgan |
| 9 | Notifications (Telegram bot, guruh xabarlari, PDF hisobot, retry/dead-letter queue) | ✅ Bajarilgan |
| 10 | Analytics (dashboard, Live Leaderboard/SSE, course sales/seller statistika, dashboard-only rol) | ✅ Bajarilgan |
| 11 | Tashqi integratsiyalar (AmoCRM/Bitrix24 `CRMProvider`, Meta Ads) | ✅ Bajarilgan |
| 12 | Import/export va diagnostika (faqat ruxsatli adminlarga) | ✅ Bajarilgan |
| 13 | Infra/performance hardening — partitioning qismi ✅ (`ledger_entries`/`calls`/`webhook_events`/`audit_logs` oylik partition), staging deploy ✅ (bitta shared VPS'ga, pastdagi **Deployment** bo'limiga qarang), qolgani ❌ (Primary+Standby replikatsiya, WAL/S3 backup, real load test, CI pipeline — bularning barchasi maxsus/qo'shimcha infratuzilma talab qiladi) | 🔶 Qisman bajarilgan |
| 14 | Partition avtomatlashtirish (`audit_logs` uchun oylik partition auto-create — 13-fazaning tor davomi) | ❌ Boshlanmagan |
| — | AI yordamchi (feature flag, launch uchun majburiy emas) | ❌ Boshlanmagan, past prioritet |

## Environment

- Python 3.13, virtualenv at `.venv` (already created). Dependencies are pinned in `requirements.txt`.
- Local PostgreSQL 18 runs via `docker-compose.yml`.
- Config comes from `.env` (copy `.env.example` if it's missing).

Activate the venv before running commands:
```
.venv\Scripts\activate
```

## Commands

Start local Postgres:
```
docker compose up -d postgres
```

Apply pending DB migrations (plain `.sql` files in `app/db/migrations/`, tracked in a `schema_migrations` table — no Alembic/ORM):
```
python -m app.db.migrate
```

Run the dev server (auto-reload):
```
uvicorn app.main:app --reload
```

The app serves on `http://127.0.0.1:8000`. `test_main.http` has example requests (PyCharm/IntelliJ HTTP client, or adapt with curl). There is no automated test suite yet.

Bootstrap the first Platform Admin (no login exists yet to create one via API):
```
python -m app.db.seed_platform_admin --email admin@example.com --password '...'
```

## Deployment

A staging instance is live on a shared VPS (`89.43.33.8:8001`, deployed 2026-07-09) that also hosts an unrelated project ("barisha") — deployment was deliberately additive so it wouldn't be touched:

- Native install, not Docker (the VPS has no Docker engine and adding one just for this app wasn't worth the RAM on a 3.8GB box already running another live service). `/root/dashboarduz`, Python 3.12 (system-provided, not 3.13 — avoided adding a new apt PPA on a shared box for a non-load-bearing version bump), own venv.
- Own systemd unit `dashboarduz.service` (`uvicorn app.main:app --host 0.0.0.0 --port 8001 --workers 1`), separate from the other project's `gunicorn.service`. Own Postgres role (`dashboarduz_owner`, CREATEDB/CREATEROLE, not superuser) and database (`dashboarduz`) inside the *same* native Postgres cluster the other project also uses — never touches its `barisha_2` database or the cluster's `postgres` superuser role.
- Code gets there via tar + SFTP, not `git pull` — the GitHub remote (`Fenix-dev-72/Tzmliy`) is private and no deploy key is set up on the VPS yet. Re-deploying a code change means repeating that (package the working tree, excluding `.venv`/`__pycache__`/`.git`, SFTP it over, extract over `/root/dashboarduz`, restart the service), not a simple `git pull`.
- **No TLS/domain yet** — reachable directly over plain HTTP on port 8001, no nginx in front (adding a new nginx server block was possible but skipped since there's no domain to point at it yet; the existing `barisha.conf` was never touched). Fine for poking around, not for real tenant data.
- **No object storage configured** — `.env`'s `OBJECT_STORAGE_*` are literal placeholders (`unconfigured`). The app boots fine; call-recording/PDF-report uploads just fail non-fatally (per the existing best-effort design) until MinIO or real S3 credentials are wired up.
- **Phone OTP delivery is real and configured** — `TELEGRAM_GATEWAY_API_TOKEN` is set in the VPS's `.env` (from `https://gateway.telegram.org/`), verified end-to-end 2026-07-09 (real OTP code delivered to a real Telegram account via a live `/api/v1/auth/otp/request` call). The Gateway account's budget is $0 (Fragment top-up not done) — free delivery only works to the Telegram account tied to the phone number used to log in to gateway.telegram.org; sending to arbitrary tenant users' phones will fail until the account is funded.
- **CORS is temporarily wide open** — `CORS_ALLOWED_ORIGINS=*` in the VPS `.env` (2026-07-09), so the not-yet-deployed frontend can call the API from any origin during early development (the frontend's real domain/dev port wasn't known yet). See `core/middleware.py`'s security-hardening section above for how `main.py` makes `"*"` actually work with credentialed CORS. Tighten to a real origin list once the frontend has a fixed address — don't leave this open once real tenant data is involved.
- This box (2 vCPU / 3.8GB RAM, shared) is far below the TZ's Faza 13 load-test target hardware — don't run a real load test against it, and be mindful that this app now shares CPU with the other live project.
- Real credentials (JWT secret, DB passwords, platform admin password) live only in the VPS's own `/root/dashboarduz/.env` (mode 600) — never committed here or duplicated elsewhere.

## Architecture

Modular monolith, not microservices. Domains live under `app/modules/<name>/` (`auth`, `tenants`, `billing`, `sales`, `finance`, `customers`, `catalog`, `calls`, `crm`, `notifications`, `analytics`, `reports`). Each module follows the same four-file shape:

- `router.py` — FastAPI routes. Only validation, authorization, and calling into `service.py`. No SQL, no business logic.
- `service.py` — business logic.
- `repository.py` — the only place SQL is issued from, via `aiosql`-loaded queries in `sql/queries.sql`.

`app/core/` holds cross-cutting infrastructure (no business logic):
- `config.py` — `Settings` (pydantic-settings), read from `.env`.
- `database.py` — asyncpg pool lifecycle plus two connection helpers:
  - `tenant_connection(pool, tenant_id)` — opens a transaction and sets `app.tenant_id` via `set_config` for that transaction only. Every tenant-scoped query must go through this. `tenant_id` must come from the authenticated session, never a client-supplied header.
  - `platform_connection(pool)` — plain connection for `/platform` routes, which read platform-level tables (`tenants`, `platform_admins`) that carry no `tenant_id` and have no RLS; authorization there is enforced at the HTTP layer instead.

### Multi-tenancy / RLS convention

Every tenant-scoped table must carry `tenant_id` and enable RLS with a default-deny policy:
```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table> FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON <table>
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```
No default-allow policy is ever added. This only works because the app connects as `app_user`, a `NOBYPASSRLS` role created in `app/db/migrations/0001_init.sql` — RLS is always bypassed for table owners/superusers, so migrations run as a separate owner role (`MIGRATIONS_DATABASE_URL`) while the app runs as `app_user` (`DATABASE_URL`). Don't merge these two roles/DSNs.

### Money

UZS in so'm, USD in cents, both `BIGINT` — never `float`/`numeric` for money. Corrections are compensating ledger entries, never `UPDATE`/`DELETE` on existing financial rows (see `dashboarduz-finance-billing` memory).

### Auth (implemented so far)

Two separate JWT audiences, both signed with `Settings.jwt_secret`, distinguished by a `type` claim (`access`/`refresh` for tenant users, `platform_access`/`platform_refresh` for Platform Admin) — `core/deps.py`'s `get_current_user`/`get_current_platform_admin` reject the wrong type.

- Access tokens are short-lived and stateless (no DB row).
- Refresh tokens carry `{sub, tenant_id, sid}` (tenant users) or `{sub, sid}` (platform admins) and are also looked up in `refresh_sessions`/`platform_admin_sessions` by `sid`, hashed, so they're revocable and rotate on every use (old session revoked, new one issued). Because `tenant_id` comes from our own signature-verified claim — not a bare client header — resolving it to open `tenant_connection(pool, tenant_id)` at refresh time doesn't violate the "tenant_id from session, not header" rule.
- Tenant user login takes a single `identifier` (email or phone) + `password` — **no `tenant_slug`** (dropped 2026-07-09, see the Self-service registration section below). `users.email`/`users.phone` are globally unique across every tenant now, not per-tenant, specifically to make this possible.
- Login returns `LoginResponse`, not `TokenPair` directly: if `users.totp_enabled` is true it comes back as `{requires_2fa: true, pending_token}` instead of tokens; the client then calls `/2fa/verify-login` with that pending token + a TOTP code to get the real `TokenPair`. `pending_token` is its own short-lived JWT type (`two_factor_pending`), separate from access/refresh.
- Phone OTP (`/otp/request`, `/otp/verify`) and password reset (`/password-reset/request`, `/password-reset/confirm`) both hash their one-time code/token with `core.security.hash_token` (sha256) before storing, and both "request" endpoints always return `204` regardless of whether the identifier matches a real user — don't add a "user not found" branch there, it would enable account enumeration. Neither takes `tenant_slug` either, same identifier-resolution mechanism as login.
- 2FA setup itself is opt-in per user (`/2fa/setup` → scan QR from `otpauth_uri` → `/2fa/confirm` with a TOTP code to flip `totp_enabled`), but *using* a privileged permission is not: access tokens embed `totp_enabled` at issue time (`auth/service.py`'s `_issue_token_pair`, same mechanism as the `permissions` claim), and `core/deps.py`'s `require_permission` rejects any key in `auth/permissions.py`'s `PRIVILEGED_PERMISSIONS` (`users.manage`, `roles.manage`, `finance.manage`, `finance.approve`) with 403 unless `totp_enabled` is true. Same trade-off as permissions: enabling 2FA takes effect on next token refresh, not instantly.
- `core/notify.py`'s `send_alert` (billing storage/dunning warnings) is still a placeholder — logs only. `send_code`'s `channel="email"` (password reset) is also still log-only — no email provider wired up yet.
- `send_code`'s `channel="sms"` (phone OTP) **is real** (added 2026-07-09): delivered via Telegram's official Gateway API (`Settings.telegram_gateway_api_token`, `https://core.telegram.org/gateway`) rather than an actual SMS provider — it sends the code as a Telegram message to whatever Telegram account is registered under that phone number. Deliberately *not* routed through Faza 9's per-tenant-bot Telegram sender (`app/modules/notifications/telegram.py`) — that's a different, per-tenant-configured delivery path (group messages/PDF reports) with no concept of a platform-wide auth flow; Gateway API uses one platform-level token and needs no per-user bot-linking step. Delivery failure is logged, never raised (`/otp/request` always returns 204 regardless, per the enumeration-safety design) — plain `urllib.request` + `asyncio.to_thread`, same pattern as `notifications/telegram.py`. Empty `telegram_gateway_api_token` falls back to log-only, same graceful-degradation shape as unconfigured object storage.

### Self-service tenant registration (2026-07-09) — global identifiers, no `tenant_slug`

Originally, tenants were only created by a Platform Admin (`POST /platform/v1/tenants` + `.../admin-user`, 2FA+reason+audit-log gated) — the user later clarified this wasn't the intended design: a tenant should be able to sign itself up (email or phone, either one), and login shouldn't require a `tenant_slug` at all. That Platform-Admin path still exists (kept as a secondary/support tool — see Platform Admin's section below), but self-registration is now the primary one. This was a real architecture change, not just a new endpoint, because of one core tension:

- **`users` carries `FORCE ROW LEVEL SECURITY`**, so it cannot be queried at all without already knowing `app.tenant_id` — but login-by-identifier-alone means the tenant isn't known yet. Fixed with a new platform-level (no RLS), tiny lookup table, `user_login_identifiers (identifier PK, identifier_type, tenant_id, user_id)` — queried via `platform_connection` to resolve `identifier → tenant_id` *before* opening the real `tenant_connection`. Same "small lookup table sidesteps an RLS/architecture constraint" shape as `webhook_event_dedup` (Faza 13) and `subscription_payment_provider_refs` (Faza 8). Kept in sync with `users` inside the same transaction by `auth/repository.py`'s `insert_user_with_identifiers` — **every** code path that creates a user (self-registration, Tenant-Admin-adds-employee via `users_service.create_user`, Platform-Admin-creates-first-admin) must go through this, not the bare `insert_user`, or that user becomes invisible to identifier-based login. A real bug shipped this way once during development: `insert_user_with_identifiers` unconditionally tried to insert an `email` identifier row even when `email` was `None` (phone-only signup), hitting `user_login_identifiers.identifier`'s `NOT NULL` — caught by a real end-to-end test against the live VPS (phone → Telegram Gateway code → registration), not by local testing, since the local pass happened to use an email identifier. Fixed by guarding both the email and phone identifier inserts on truthiness.
- **`users.email` and `users.phone` are globally unique now** (`0020_self_registration.sql`: `UNIQUE(email)` replacing the old `UNIQUE(tenant_id, email)`, plus a new partial `UNIQUE(phone) WHERE phone IS NOT NULL`). Postgres enforces uniqueness at the index level regardless of RLS, so this is a real, race-safe global constraint even though `users` itself stays RLS-scoped for normal reads.
- **`users.email` is nullable now** (`0021_nullable_email.sql`, deliberately a separate migration from the uniqueness/lookup-table one above — layering, not a single do-everything migration), with `CHECK (email IS NOT NULL OR phone IS NOT NULL)` — phone-only registration means a user can exist with no email at all. Every response schema that surfaces `email` (`MeOut`, `UserOut`) had to become `email: str | None` to match; `setup_2fa`'s TOTP `provisioning_uri` name falls back to `user["phone"] or str(user_id)` when email is absent.
- **Registration is three endpoints**, mirroring the OTP shape but keyed by a bare identifier instead of an existing user (nothing exists yet): `POST /auth/register/request-code` (send a 6-digit code — SMS channel routes through the real Telegram Gateway sender, email channel is still log-only) → `POST /auth/register/verify-code` (returns a short-lived `registration_pending` JWT, a fourth JWT type alongside access/refresh/two_factor_pending) → `POST /auth/register/complete` (creates the tenant, seeds default roles, creates the first Admin user from the verified identifier, auto-issues a real `TokenPair` — no separate login call needed). New platform-level table `registration_verifications` (no tenant yet, so nothing to RLS-scope to) backs the code itself, same shape as `otp_codes`.
- Unlike login/OTP/password-reset, `request_registration_code` **does** raise a distinct `IdentifierTakenError` (→ 409) when the identifier is already registered — telling a signup form "this email/phone is taken" is normal, expected UX, not the same account-enumeration risk as probing an existing account's login (the caller is trying to create something new, not fishing for what exists).
- **15-day trial, no payment info required upfront**: `tenants.trial_ends_at` is a new column, `DEFAULT (now() + interval '15 days')` at the DB level (so *every* tenant-creation path — self-registration and the Platform-Admin one — gets the same default; existing pre-migration tenants were explicitly backfilled to `NULL`, meaning "no automatic expiry"). `billing/service.py`'s `run_dunning` was extended with a `trial` branch (checked before the existing `active/past_due/grace` ladder) that flips `trial → suspended` once `trial_ends_at` has passed with no paid subscription. Paying to skip/end the trial early is *not* a new code path — the frontend just calls the already-existing `POST /api/v1/billing/payments/initiate` right after registration completes, same as any other subscription payment.
- `users_service.create_user` (Tenant-Admin-adds-employee) now pre-checks phone uniqueness via `get_login_identifier` before inserting (new `PhoneTakenError` → 409) — `insert_user`'s `ON CONFLICT (email)` only guards the email side; a phone collision would otherwise surface as a raw `asyncpg.UniqueViolationError` (500), the exact anti-pattern flagged in the aiosql/uniqueness conventions below.

### RBAC (Faza 2)

`users.role` (fixed enum) is gone — replaced by `users.role_id → roles`, per-tenant and Tenant-Admin-editable:

- `roles` (tenant-scoped, RLS) + `role_permissions` (tenant-scoped, RLS, denormalizes `tenant_id` from the parent role since RLS needs a real column on every tenant table, not a join). One role per user — no many-to-many `user_roles` table, matching the TZ's "bitta rol" model.
- Permission keys are a fixed catalog in code (`app/modules/auth/permissions.py`, e.g. `users.view`, `users.manage`, `roles.view`, `roles.manage`), not a DB table — add new keys there as modules gain their own permissions.
- `roles_service.seed_default_roles(pool, tenant_id)` runs once, right after a tenant is created (`tenants/service.py create_tenant`), seeding `admin`/`manager`/`agent`/`finance` as `is_system=true` roles with the defaults in `DEFAULT_ROLE_PERMISSIONS`. Tenant Admin can then create further custom roles (`OnlineAgent`, `Tashkiliy`, ...) with any subset of the permission catalog via `POST /api/v1/roles`.
- Access tokens embed the resolved permission set as a `permissions` claim at issue time (`auth/service.py`'s `_issue_token_pair` calls `roles_service.get_role_permission_keys`). `core/deps.py`'s `require_permission(key)` is a pure claim check — no DB round trip on the request hot path. Trade-off: revoking a permission takes effect on next token refresh (≤ `access_token_ttl_minutes`), not instantly.
- `app/modules/auth/` is now three services, not one: `service.py` (session/login/OTP/2FA/password-reset — unchanged from Faza 1), `users_service.py` (Tenant-Admin-driven user CRUD: create/list/update-role/deactivate), `roles_service.py` (role/permission CRUD + seeding). Same split for schemas (`schemas.py` / `users_schemas.py` / `roles_schemas.py`) and routers (`router.py` / `users_router.py` / `roles_router.py`).
- Dashboard role + per-dashboard password is deferred to Faza 10 (Analytics/Dashboard), since it's meaningless before there's a Live Leaderboard to gate.

### Platform Admin 2FA + audit log

`platform_admins` gets the same opt-in TOTP 2FA as tenant users (`/platform/v1/auth/2fa/setup` → `/2fa/confirm` → login returns `PlatformLoginResponse{requires_2fa, pending_token}` → `/2fa/verify-login`), plus one extra rule the TZ requires specifically for Platform Admin: **touching a tenant's actual data requires 2FA to already be enabled, not just available.**

- `tenants/service.py create_tenant_admin_user` re-fetches the admin row and rejects with `TwoFactorRequiredError` (→ 403) if `totp_enabled` is false — the request needs a valid `reason` string (schema-required, not just convention) and writes an immutable row to `audit_logs` (`actor_id`, `tenant_id`, `action`, `reason`) after the write succeeds.
- Checking `admin.totp_enabled` is sufficient proof that this token passed 2FA — the invariant is that `platform_login` never issues a real access token for a `totp_enabled` admin except via the `/2fa/verify-login` path, so a valid `platform_access` token for such an admin could only have come from there. No separate "amr"/2fa-verified claim needed.
- This create-tenant-admin-user endpoint is the only platform route today that touches tenant-scoped data (vs. the platform-level `tenants`/`platform_admins` tables) — any future platform route that reads/writes into a tenant's tables should follow the same reason+2FA-check+audit-log pattern, not just `get_current_platform_admin`.
- `audit_logs` is partitioned by month (`app/db/migrations/0005_platform_admin_2fa_audit.sql` hand-creates a few months of partitions) and carries no RLS — it's platform-level, queryable only via `GET /platform/v1/audit-logs`. Automating future partition creation is Faza 14's job, not done yet.

### Catalog (Faza 3)

`catalog_categories` is a tenant-scoped, RLS'd adjacency-list tree (self-referencing `parent_id`), not a fixed-depth schema — matches the TZ's example of an arbitrarily deep chain (Telefon → S25 ultra → Qora → 512GB).

- `GET /api/v1/catalog/categories` returns the whole tree already nested (`CategoryNode.children`), built in `service._build_tree` from one flat tenant-scoped `SELECT` — not one query per level.
- Sibling names must be unique per parent; enforced by two partial unique indexes (root vs. non-root) rather than one `UNIQUE(tenant_id, parent_id, name)`, because SQL NULLs are never equal to each other so a plain composite unique constraint silently lets duplicate *root* names through.
- Deleting a category with children is rejected (409) rather than cascading — an explicit "delete children first" is safer than a silent subtree wipe. The FK itself (`ON DELETE` left as the Postgres default `NO ACTION`) backs this up at the DB level too.
- New permission keys (`catalog.view`, `catalog.manage`) only apply to *new* tenants via `DEFAULT_ROLE_PERMISSIONS` — existing tenants' system roles need an explicit backfill `INSERT INTO role_permissions` in the same migration that introduces the key (see `0006_catalog.sql`'s tail). Do this for every future permission addition, or existing tenants silently lose access to features their role should already cover.

### Customers, Sales, Finance (Faza 4-6)

`customers` is a deliberately minimal mijoz entity (name, phone deduplicated per tenant via `UNIQUE(tenant_id, phone)`, optional `responsible_user_id`) plus a `stage` column (`lead`/`qualified`/`customer`/`lost`) and an append-only `crm_activities` table — leads and customers are modeled as *the same row* progressing through `stage`, not a separate leads table. Manual notes/calls are logged via `POST /customers/{id}/activities`; `stage` changes on `PATCH /customers/{id}` are auto-logged as a `status_change` activity by `customers/service.py`'s `update_customer`.

`sales` is the contract: `customer_id` (required), `catalog_category_id` (nullable — a sale usually points at a catalog leaf node but freeform contracts are allowed), price/currency/deadline/`status` (`active`/`completed`/`cancelled`, terminal once non-`active`), and a `version` column for optimistic concurrency (every `PATCH` must pass the `version` it read; the repository `UPDATE ... WHERE id=:id AND version=:expected_version` returning zero rows means a 409). Every field change is diffed and written to append-only `sale_changes`. `finance.service.apply_tariff_change` is the *only* code outside this module allowed to mutate price/deadline (called when a `tariff_change` adjustment_request is approved).

`finance` covers payments, the ledger, and the refund/tariff-change approval workflow:
- `ledger_entries` is append-only and signed (positive = increases what the customer owes, negative = decreases it) — a sale's balance is always `SUM(amount)`, never a cached column. `sales.router.create_sale` posts the initial `charge` entry; `record_payment` posts a `payment` entry; an approved refund posts a `refund` entry.
- `adjustment_requests` is the `pending`/`approved`/`rejected` envelope for both `refund` and `tariff_change` requests, gated by `sales.manage` to create and `finance.approve` to approve/reject. Approving a `refund` inserts an immutable `refunds` row + ledger entry, all in one transaction. Approving a `tariff_change` calls `sales_service.apply_tariff_change` in a *second*, separate transaction (no cross-module shared-transaction primitive exists) — if that second call 409s (the sale's version moved since the request was filed), the request is left `approved` with no sale mutation, surfaced as `AdjustmentApplyConflictError` requiring manual reconciliation.
- `bonus_plans` (versioned commission rate in basis points, `effective_from`/`effective_to`) + `payroll_entries` (computed, on-demand only — no background worker/scheduler exists yet) via `POST /finance/payroll/calculate`, which upserts per `(tenant_id, user_id, period_start, period_end, currency)`.
- **Every financial create-POST requires an `Idempotency-Key` header**, per the TZ: `sale_payments`/`sales`/`adjustment_requests`/`bonus_plans` all have `UNIQUE(tenant_id, idempotency_key)` + `INSERT ... ON CONFLICT DO NOTHING RETURNING ...`; a `None` result means re-fetch by key and compare the payload — match returns the original row (safe retry), mismatch raises `IdempotencyKeyReusedError` (409). `sales.service.create_sale` returns `(sale, is_new)` specifically so `sales/router.py` only calls `finance_service.post_charge` on true creation, never on a replayed retry. Approve/reject (mutate-in-place, not create) instead store the key that performed the transition in `adjustment_requests.review_idempotency_key`, checked before raising `AdjustmentRequestConflictError` on a non-pending re-submit.
- `POST /finance/payroll/calculate` has no `idempotency_key` column — its upsert-on-period-recalculate semantics already give the same replay-safety, so adding one would be redundant.

### Privileged permissions require 2FA

Per the TZ's "privileged rollar uchun 2FA": `auth/permissions.py`'s `PRIVILEGED_PERMISSIONS` (`users.manage`, `roles.manage`, `finance.manage`, `finance.approve`) are blocked by `core/deps.py`'s `require_permission` with a 403 unless the caller's access token carries `totp_enabled: true`. That claim is embedded at issue time in `auth/service.py`'s `_issue_token_pair` (same mechanism/trade-off as the `permissions` claim — enabling 2FA takes effect on next refresh, not instantly). Adding a new privileged permission means adding it to `PRIVILEGED_PERMISSIONS`, not just `ALL_PERMISSIONS`.

### Calls, Attendance (Faza 7)

UTEL and "Мои звонки" have no available public API docs, so `app/modules/calls/providers.py`'s `UtelProvider`/`MoiZvonkiProvider` are **invented-but-plausible placeholders** (payload shape + HMAC signature scheme) proving out a pluggable `CallProvider` interface (`verify_signature`, `parse_event` → `ParsedCallEvent`) — replace their internals with the real spec when it arrives; nothing in `service.py`/`router.py` should need to change. The two adapters deliberately use *different* signature schemes (raw hex HMAC vs. timestamp+base64 HMAC with a replay window) to prove the abstraction isn't accidentally shaped around one provider.

- **Webhooks are the one deliberate exception to "tenant_id never from client input"**: `POST /api/v1/calls/webhooks/{provider}/{tenant_id}` has no session (external providers can't hold a JWT), so tenant_id comes from the URL — but that's just routing. The actual authentication is the HMAC signature, verified against *that tenant's* stored secret (`integration_credentials`, decrypted via `core/crypto.py`'s Fernet wrapper). A forged tenant_id is useless without the matching secret. Signature-invalid events are **never persisted** (an attacker controls the tenant_id in the URL, so writing unbounded unauthenticated payloads would be a DoS vector) — `webhook_events` only ever contains signature-valid rows.
- `webhook_events` (generic, provider-agnostic) is idempotency+audit infra meant for reuse by future integration phases (CRM, Telegram, Payme/Click), not calls-specific — keyed `UNIQUE(tenant_id, provider, external_event_id)`.
- Ingestion is deliberately two separate transactions (`calls/service.py`'s `ingest_webhook`): Tx#1 verifies the signature and writes `webhook_events`+`calls`; the recording download/upload happens **outside any transaction** so a slow provider doesn't hold a DB connection open; Tx#2 marks the event processed. No background worker/outbox exists yet, so this all happens synchronously inside the webhook request — a slow/unavailable recording URL will slow down that response. Recording download failure is **non-fatal** (best-effort): the call row persists either way, `recording_object_key` just stays `NULL`.
- `app/core/crypto.py` (Fernet) and `app/core/storage.py` (S3-compatible via `boto3` + `asyncio.to_thread`, same blocking-call pattern as bcrypt in `core/security.py`) are generic, first introduced here — reused as-is by Notifications (Faza 9, Telegram bot tokens + PDF report uploads) and CRM integrations (Faza 11, AmoCRM/Bitrix24 credentials), matching the original intent rather than inventing parallel helpers. Billing (Faza 8) is the one exception: Click/Payme are the *platform's own* single merchant accounts, so their secrets live in `Settings`/`.env`, not `integration_credentials` — see Faza 8's section below. Recordings are stored under `recordings/{tenant_id}/{call_id}.mp3` and served only via short-lived presigned URLs (`GET /calls/{id}/recording`), never proxied through the app.
- Local dev needs a `minio` service (added to `docker-compose.yml`) as the S3-compatible target — `docker compose up -d postgres minio`, then create the bucket once (`OBJECT_STORAGE_BUCKET` in `.env`) via the MinIO console or a one-off `boto3`/`mc` call; the app doesn't create its own bucket.
- `calls.manage` (integration credentials + manager mappings) is in `PRIVILEGED_PERMISSIONS` (2FA-gated) since it writes webhook secrets — `calls.view` is not.
- `attendance` is a separate module from `calls` (keeps the four-file shape clean) even though the TZ groups them in the same bullet. Self check-in/check-out needs no permission at all (`Depends(get_current_user)`, not `require_permission`) since every authenticated user must be able to act on their own record — only viewing *others'* attendance (`attendance.view`) or pushing a record on someone else's behalf (`attendance.manage`, e.g. an external device/API integration) requires a permission. A partial unique index (`WHERE check_out_at IS NULL`) stops a user from having two open check-ins at once — caught as `asyncpg.UniqueViolationError` → `AlreadyCheckedInError`.

### Billing (Faza 8) — platform's own SaaS revenue, not `finance`

`app/modules/billing/` is the platform billing its *tenants* for the SaaS product (three fixed plans, Click/Payme/manual invoicing, subscription lifecycle, storage limits) — deliberately separate from `finance` (Faza 6), which is a tenant's own *customer* payments/ledger.

- `billing_plans` is platform-scoped (no RLS, like `tenants`), `code CHECK (code IN ('starter','business','enterprise'))` structurally enforces "exactly three plans." Platform Admin can `PATCH` price/limits, never create/delete a plan.
- `tenant_subscriptions`/`subscription_payments`/`storage_usage_snapshots` are tenant-scoped + RLS, same as every other business table. Subscription *lifecycle state* lives on `tenants.status` (already had the right CHECK values: `trial/active/past_due/grace/suspended/cancelled`) — `tenant_subscriptions` only tracks which plan + which billing period is current. Cross-module status flips (`tenants_repository.update_tenant_status`) run on the *same* connection billing's `tenant_connection` already has open — safe because `tenants` has no RLS policy at all, so any connection can write it regardless of which helper opened it.
- Payme is implemented to the real Merchant API (confirmed via live docs fetch): JSON-RPC 2.0, `CheckPerformTransaction`/`CreateTransaction`/`PerformTransaction`/`CancelTransaction`/`CheckTransaction`, `Authorization: Basic base64("Paycom:"+key)`, amounts in tiyin (so'm × 100) — converted only at the `providers.py` boundary. Because `PerformTransaction`/`CancelTransaction`/`CheckTransaction` carry only Payme's own opaque transaction id (no tenant info), a small platform-level `subscription_payment_provider_refs` lookup table resolves `provider_transaction_id → tenant_id` before opening the real `tenant_connection`.
- Click is Prepare/Complete + MD5 `sign_string`, sourced from stable community docs (not live-fetched in full) — flagged for re-verification against `docs.click.uz` during real sandbox onboarding, same caveat style as Faza 7's UTEL placeholders. `merchant_trans_id` is chosen by us as `{tenant_id}:{payment_id}`, so Click's own callbacks always carry tenant_id directly — no lookup table needed for Click, unlike Payme.
- Storage usage is a real per-tenant approximation: `SUM(pg_column_size(t.*))` across every tenant-scoped table, run *inside* `tenant_connection` so RLS naturally scopes it — never `pg_total_relation_size` (that sums *all* tenants' rows in a shared table). Computed on-demand (`POST .../storage/recalculate`), not a real cron — this repo had no scheduler until Faza 9.
- `billing.manage` is privileged (2FA-gated) — it moves money and changes plans.
- Needed a real, previously-missing dependency: `python-multipart` (Click's webhook is form-encoded; FastAPI/Starlette's `request.form()` requires it). Added to `requirements.txt` — any future form-encoded webhook (Faza 11's AmoCRM/Bitrix24) already has it.

### Notifications (Faza 9) — first real background worker

`app/modules/notifications/` is Telegram bot integration (per-tenant bot token, category→group message routing), PDF report generation, and a retry/dead-letter-queue delivery pipeline.

- Telegram bot tokens reuse `integration_credentials` (`provider='telegram'`, token in `webhook_secret_encrypted`) — same per-tenant-credential shape as UTEL, since each tenant runs its own bot (unlike billing's Click/Payme, which are the platform's *own* single merchant accounts in `Settings`).
- `notification_outbox` (mutable current state: `pending/sent/failed/dead_letter`, `retry_count`, `next_attempt_at`) + `notification_delivery_log` (append-only, one row per attempt) are two separate tables — mirrors the rest of the repo's "current state" vs. "immutable history" split (`sales`/`sale_changes`, `adjustment_requests`/`ledger_entries`).
- **`app/modules/notifications/worker.py`'s `run_forever` is the first real background `asyncio.create_task` loop in this repo** — started in `main.py`'s `lifespan`, cancelled+awaited on shutdown. Every prior "deferred work" case (finance payroll, billing storage-recalculate) was on-demand-POST-only; this is a deliberate architectural first, not a convention violation. Poll interval: `Settings.notification_worker_poll_seconds`.
- Delivery is two-phase per message (mirrors `calls/service.py`'s `ingest_webhook` split): read the due message + credential inside `tenant_connection`, do the actual Telegram HTTP call *outside* any transaction, then a fresh `tenant_connection` to record the outcome (sent, or retry with exponential backoff capped at `max_retries`, or `dead_letter`).
- Telegram Bot API calls use plain `urllib.request` + `asyncio.to_thread` (`app/modules/notifications/telegram.py`) — no async HTTP client dependency exists in this repo; `send_document`'s multipart body is hand-encoded (small boundary-based encoder), no library needed.
- PDF reports use `reportlab` (pure-Python, no system libs like Pango/Cairo) — added to `requirements.txt`. Only one concrete report is implemented (sales summary for a period), not a speculative multi-report framework.
- `notifications.manage` is privileged (can trigger arbitrary outbound messages to a tenant's Telegram groups).

### Analytics (Faza 10) — third JWT audience, first SSE

`app/modules/analytics/` covers dashboard summary, seller leaderboard, category/"course" sales stats, and a **dashboard-only** access mode with per-dashboard passwords.

- **`dashboards` is a new table, not a `roles`/`users` row** — `users.role_id` is `NOT NULL` and requires an email+password, so a passwordless-email "dashboard" needed its own table (`id, tenant_id, name, password_hash`) and its own JWT audience: `type: "dashboard_session"` claims, checked by `core/deps.py`'s `get_current_dashboard` (mirrors `get_current_platform_admin`'s shape exactly). Access-token-only, no refresh — a dashboard is a persistent kiosk screen, it just re-logs-in (name+password) on expiry (`Settings.dashboard_session_ttl_hours`, default 24).
- Every dashboard shows the **same tenant-wide** leaderboard/stats (a deliberate simplicity choice) — "can't access another dashboard" means it can't reach another dashboard's own name/credential, not that the underlying data differs. Tenant-facing (`/api/v1/analytics/...`, normal JWT) and dashboard-facing (`/api/v1/dashboard-sessions/...`, dashboard JWT) routes call the *same* `service.py` functions.
- "Course sales" = sales grouped by `catalog_category_id` — not a new entity, matching the existing precedent that a catalog leaf is just a product/service/course.
- Ranking/grouping queries always group by `(entity, currency)` too, never just entity — money is per-currency BIGINT and never mixed (UZS so'm vs USD cents), matching `finance`'s existing `get_collected_payments_by_currency` precedent.
- **`app/modules/analytics/router.py`'s `/leaderboard/stream` is the first Server-Sent Events endpoint in this repo** — plain Starlette `StreamingResponse(media_type="text/event-stream")`, no `sse-starlette` dependency. Each tick opens/closes its own short-lived `tenant_connection` (never holds one open across `asyncio.sleep`), stops cleanly on `await request.is_disconnected()`.
- Periods default to "today" in a fixed `Asia/Tashkent` (UTC+5) offset (`timezone(timedelta(hours=5))`) — no timezone-DB dependency needed since the product spec fixes this tenant-wide.
- `analytics.manage` is privileged (mints a new standing dashboard password-credential); `analytics.view` is — unlike every other `*.view` key — also granted to `agent`, since a seller leaderboard's whole point is to be visible to the sellers being ranked.

### External integrations (Faza 11) — `app/modules/crm/` finally built out

`app/modules/crm/` existed as a 0-byte stub from the original module list (`crm` listed separately from `customers`) but was never implemented — Faza 4's actual work landed in `customers/` (`crm_activities`, a purely internal agent-notes log). Faza 11 built the real external-integrations module here, leaving `customers.crm_activities` untouched.

- AmoCRM and Bitrix24 share a `CRMProvider` Protocol (`app/modules/crm/providers.py`, mirrors `calls/providers.py`'s shape but bidirectional: `verify_webhook`, `parse_lead_event`, `async push_lead`). Meta Ads is pull-only analytics (no lead/webhook concept), so it does *not* implement `CRMProvider` — it's a separate `meta_ads.py` client, same reasoning as billing's Payme/Click not sharing one interface.
- **None of the three integrations use OAuth**: Bitrix24 runs in server-webhook-only mode (the TZ itself says "OAuth OR server webhook" — webhook is simpler and was chosen), and Meta Ads uses a long-lived System User access token (Meta's own recommended pattern for unattended server integrations, non-expiring, no refresh-token dance). Every credential is a long-lived token/URL the tenant pastes in once, same shape as UTEL/Telegram.
- `integration_credentials` was *extended*, not replaced: `webhook_secret_encrypted` is now nullable (Meta Ads has no webhook at all) and a new `external_account_id` column holds AmoCRM's subdomain / Meta's ad account id (Bitrix24 doesn't need it — its one credential *is* a full incoming-webhook URL, stored in `api_key_encrypted`).
- Inbound webhook idempotency reuses `webhook_events` (`provider IN ('amocrm','bitrix24')`) exactly like calls. A new `crm_lead_syncs` table (append-only, `direction IN ('inbound','outbound')`) audits every sync attempt, separate from `customers.crm_activities` so that table's `CHECK`/`actor_user_id NOT NULL` didn't need touching for system-driven (no human actor) events.
- **A second, independent background worker** (`crm/worker.py`, `Settings.meta_ads_sync_poll_seconds`, default 6h) runs alongside — not merged into — the notifications outbox worker, both started as separate `asyncio.create_task`s in `main.py`'s `lifespan`. One distinct kind of background work = one distinct task.
- AmoCRM's exact webhook payload/signature scheme could not be confirmed via live docs in this session (AmoCRM's classic webhooks also genuinely aren't HMAC-signed) — the shared-secret-query-param verification and form-encoded bracket-notation parsing (`leads[status][0][id]`) should be re-verified against `amocrm.ru/developers` during real sandbox onboarding. Bitrix24's `crm.lead.add` and Meta's Graph API `insights` endpoint were confirmed via live fetch and validated against the real APIs (a fake token/domain still produced genuine, well-formed error responses from the real services).
- `customers/repository.py` gained one new query, `get_customer_by_phone` — needed so inbound CRM webhooks can dedup against `customers.phone` (`UNIQUE(tenant_id, phone)`) the same way `insert_customer`'s `ON CONFLICT DO NOTHING` already does internally.

### Import/export & diagnostics (Faza 12) — `app/modules/reports/`

TZ section 5's one-line spec ("Import/export, muammoli tushumlar va diagnostika faqat ruxsatli adminlarga beriladi") was scoped down with the user before building: **no import** (nothing consumes it yet, so building it would be speculative), export limited to `customers`/`sales`/`finance`/`calls`, and diagnostics covering both financial anomalies and operational/system-health backlogs.

- Two new permission keys, `reports.view` (diagnostics) and `reports.export` (bulk CSV/XLSX dumps). Unlike every prior permission addition, **neither is added to `manager`/`agent`/`finance`'s `DEFAULT_ROLE_PERMISSIONS`** — only `admin` (which is always `ALL_PERMISSIONS`) gets them, and the `0017_reports.sql` backfill only grants them to existing tenants' `admin` system role. This is deliberate, matching the TZ's "faqat ruxsatli adminlarga" (authorized admins only) — a Tenant Admin can still hand `reports.*` to a custom role manually, same as any other permission.
- `reports.export` is in `PRIVILEGED_PERMISSIONS` (2FA-gated) because bulk export of customer/finance/call data is a real data-exfiltration surface (flagged in the `dashboarduz-security-gaps` memory before this phase existed). `reports.view` (diagnostics) is not privileged — it surfaces aggregate counts/small anomaly lists, not bulk PII.
- No new tables — this module is read-only over existing tenant-scoped tables via the normal `tenant_connection`, so RLS already covers it.
- `GET /api/v1/reports/diagnostics` runs five fixed checks (not a general-purpose query builder): sales missing their initial `charge` ledger entry, `adjustment_requests` stuck `pending` past `DEFAULT_STALE_ADJUSTMENT_DAYS` (3), sales with a negative `SUM(ledger_entries.amount)` balance, unprocessed `webhook_events` grouped by provider, and `notification_outbox` backlog grouped by status. These are the checks that were actually feasible against the existing schema, not an exhaustive audit — extend `reports/sql/queries.sql` if a new anomaly class becomes relevant.
- `GET /api/v1/reports/export/{entity}?format=csv|xlsx` — `entity` and `format` are both `Literal[...]` path/query params (FastAPI 422s on anything else, no manual validation needed). CSV uses the stdlib `csv` module; XLSX needed a new dependency, `openpyxl` (first spreadsheet-writing dependency in this repo — `reportlab` from Faza 9 does PDF, not XLSX). Each entity has a **fixed column list** (`reports/export_writers.py`) rather than deriving headers from the first row, so an empty result set still produces a valid header-only file. The `finance` entity exports `ledger_entries` (not `sale_payments`) since it's the single append-only source of truth covering charge/payment/refund/adjustment in one export, per `dashboarduz-finance-billing`'s ledger convention.

### Partitioning (Faza 13, first slice — 2026-07-09)

`ledger_entries`, `calls`, and `webhook_events` converted from plain tables to `PARTITION BY RANGE` (monthly), matching `audit_logs`' existing shape from Faza 2. Only the partitioning slice of Faza 13 — replication, WAL/S3 backup, load test, and CI still need real VPS/git access and remain undone (`0019_infra_partitioning.sql`):

- Postgres requires every unique constraint (PK included) on a partitioned table to contain the partition key column. Each table's partition key was chosen to avoid weakening idempotency, not just picked mechanically:
  - `ledger_entries`: no pre-existing uniqueness beyond its PK, so `PRIMARY KEY (id) → (id, created_at)` was a mechanical change.
  - `calls`: partitioned by **`started_at`**, not `created_at` — `started_at` comes from the provider's webhook payload (`ParsedCallEvent.started_at`), not a server timestamp, so it's stable across retries. Folding it into the idempotency constraint (`UNIQUE(tenant_id, provider, external_call_id) → UNIQUE(tenant_id, provider, external_call_id, started_at)`) doesn't weaken retry-safety.
  - `webhook_events`: **`created_at` is `DEFAULT now()`, generated fresh on every insert call** — not stable across retries at all. Folding it into a uniqueness constraint the same way would make `ON CONFLICT DO NOTHING` match only if two inserts landed in the same microsecond, silently breaking retry dedup on *every* retry (not just at month boundaries — this was caught before shipping, not discovered after). Fix: `webhook_events` itself now carries no uniqueness constraint at all; a new small **unpartitioned** table, `webhook_event_dedup` (`PRIMARY KEY (tenant_id, provider, external_event_id)`), is the real idempotency gate — `calls/repository.py`'s `claim_webhook_event()` must be called and checked *before* `insert_webhook_event()` (which is now an unconditional insert). Same "small lookup table sidesteps a partition-key constraint problem" shape as Billing's `subscription_payment_provider_refs` (Faza 8). Both `calls/service.py`'s `ingest_webhook` and `crm/service.py`'s `ingest_webhook` (which shares `calls_repository.claim_webhook_event`/`insert_webhook_event`) were updated to the claim-then-insert order.
- Converting an *existing* table to partitioned (not creating one fresh, unlike `audit_logs` in Faza 2) needs a rename-recreate-copy dance: `RENAME TO x_unpartitioned` (renaming a table does **not** rename its indexes/constraints, so those get renamed too to free up the original names) → `CREATE TABLE x (...) PARTITION BY RANGE (...)` with RLS/policy/indexes re-declared on the new parent → `CREATE TABLE x_2026_06 PARTITION OF x FOR VALUES FROM (...) TO (...)` per month → `INSERT INTO x SELECT * FROM x_unpartitioned` → `DROP TABLE x_unpartitioned`. All inside one migration transaction (`app/db/migrate.py` wraps each file in `conn.transaction()`), so a mistake mid-migration rolled back cleanly rather than leaving the DB half-converted (this happened once during development — an index-name collision — and rolled back with zero side effects).
- **RLS on partitions**: policies defined on the partitioned *parent* table apply automatically to every partition when queried through the parent — partitions do **not** need `ENABLE ROW LEVEL SECURITY` set individually. This only holds for access via the parent table name, which is all app code ever does (partition names like `calls_2026_07` are an implementation detail no query references directly).
- **Every table also got a `DEFAULT` partition** (`x_default PARTITION OF x DEFAULT`) as a safety net — an insert with a `created_at`/`started_at` outside the hand-created monthly ranges lands there instead of erroring. `audit_logs` got one added too (it never had one since Faza 2). Operational catch for Faza 14: once a `DEFAULT` partition holds rows for a given month, a new named partition for that month can no longer be attached without first moving that data out — partition automation must create each month's partition *ahead of time*, not lean on the default as a substitute for that.
- Nothing holds a foreign key *into* any of these four tables (verified via grep before starting — `ledger_entries`/`calls`/`webhook_events`/`audit_logs` only have outbound FKs), which is what made this conversion safe to do without any cross-table cleanup.
- `get_call_by_id`/`update_call_recording_key`/`mark_webhook_event_processed` filter by `id` alone (not the partition key) — functionally correct post-partitioning (Postgres fans the lookup out across every partition instead of pruning to one), and still an efficient index scan per partition rather than a sequential scan, since each partition inherits the composite `(id, started_at)`/`(id, created_at)` PK index and `id` is its leftmost column.

### Security hardening pass (first round done 2026-07-09)

The user pulled this forward (before Faza 13) with an explicit "world standard, brute-force-resistant" requirement. What landed (`0018_security_hardening.sql`):

- **Account lockout on every password surface**: `users`/`platform_admins`/`dashboards` all carry `failed_login_attempts` + `locked_until`. `Settings.login_max_failed_attempts` (5) consecutive failures lock for `Settings.login_lockout_minutes` (15). The increment-and-maybe-lock is one atomic `UPDATE ... CASE` (`record_failed_login` etc.), so concurrent failures can't race past the threshold. Locked accounts get the same **generic 401** (OWASP: never confirm an account exists or is locked) and the password is *not* verified during lockout — a locked window must not be a password oracle.
- **TOTP failures share the same counter** as password failures (`verify_login_2fa`), and a correct password deliberately does **not** reset the counter when 2FA is still pending — otherwise an attacker who knows the password could bank unlimited TOTP guesses 5 at a time. Reset happens only after the *full* login.
- **Transaction/rollback gotcha (real bug found here)**: `tenant_connection` wraps a transaction, so `record_failed_login(...)` followed by `raise` *inside* the block silently rolls the increment back. Every counter-write path must exit the `async with` cleanly and raise *after* it. The pre-existing OTP `increment_otp_attempt` had exactly this bug since Faza 1 — `otp_max_attempts` was a no-op until this pass fixed it. `platform_connection` has no transaction wrapper (autocommit), so platform paths may raise in place.
- **Timing equalization**: `core/security.py`'s `equalize_password_timing` burns a dummy bcrypt verify on every not-found/locked path of all three login flows, so response time can't distinguish "no such account" from "wrong password". `tokens_match` (hmac.compare_digest) replaced `==` on refresh-session/OTP hash comparisons.
- **Per-IP rate limiting** (`app/core/middleware.py`, pure ASGI — deliberately not `BaseHTTPMiddleware`, which would interfere with the analytics SSE stream): sliding window, two buckets — credential endpoints (`rate_limit_auth_requests`/min, default 10) and signed webhooks (default 120). **In-memory and per-process** — fine for one instance; the two-VPS Faza 13 layout must swap in the TZ's earmarked Redis/Valkey store. `trust_x_forwarded_for` stays false until a trusted reverse proxy exists.
- **Security headers middleware** (nosniff, DENY, referrer-policy; HSTS only outside `app_env=development`) + **CORS off by default** (`cors_allowed_origins` empty ⇒ middleware not installed; ordinarily never wildcard, since responses carry credentials — `main.py` special-cases the literal value `"*"` to `allow_origin_regex=".*"` instead of a real `allow_origins=["*"]`, which browsers reject outright once `allow_credentials=True`; this is a deliberate, temporary staging exception (2026-07-09, frontend origin not finalized yet — see `CLAUDE.md`'s Deployment section) and should be tightened to a real origin list once the frontend has a fixed domain/port). Middleware order (innermost→outermost): RateLimit → CORS → SecurityHeaders, so preflights don't burn rate budget and even 429s carry the headers.

Still open (for the *final* full audit once all Faza are done — also tracked in `dashboarduz-security-gaps` memory):
- **AmoCRM webhook secret as URL query param** (`crm/providers.py`) — AmoCRM classic-webhook design constraint; revisit at real sandbox onboarding.
- **No automated test suite** — RLS/permission correctness still only manually smoke-tested.
- **No CI dependency/CVE scanning** (no CI yet — Faza 13).
- **Dev-only smoke-test accounts in the local DB** — clean before any shared environment.

### Conventions learned from a Faza-2/3 bug pass

- `hash_password`/`verify_password` (`core/security.py`) are `async` — they run bcrypt in a thread via `asyncio.to_thread` because bcrypt is CPU-bound and synchronous; calling it directly on the event loop would serialize every concurrent login/signup. Always `await` them; never reintroduce a sync call site.
- Email is normalized (`.strip().lower()`) in the service layer before every lookup or insert (`auth/service.py`, `users_service.py`, `tenants/service.py`, `seed_platform_admin.py`) — Postgres text comparison is case-sensitive, so skipping this lets `Foo@x.com` and `foo@x.com` collide as "different" users.
- Any `INSERT` guarded by a `UNIQUE` constraint reachable from user input (email, slug, role name, ...) uses `ON CONFLICT (...) DO NOTHING RETURNING ...` and the repository/service layer treats a `None` result as "already taken" — never a bare `INSERT` that lets `asyncpg.UniqueViolationError` bubble up as an unhandled 500. `roles_repository.insert_role` was the original correct example; `tenants.insert_tenant` and `auth.insert_user` were fixed to match it.
- Any `PATCH`/mutate-by-id endpoint (e.g. `users_router`'s role-update/deactivate) fetches the row first and raises a domain "not found" error if it's `None`, rather than letting an `UPDATE ... WHERE id = :id` silently affect zero rows under RLS and still return `204`. Follow the `catalog` module's fetch-then-check pattern for every future by-id mutation.
- Schemas that **set** a new password (`UserCreate.password`, `PasswordResetConfirm.new_password`, `TenantAdminUserCreate.password`) carry `Field(min_length=8, max_length=72)` — 72 because bcrypt silently truncates beyond that. `LoginRequest.password` deliberately has no such constraint; it must accept whatever was already set under an older or different policy.

### aiosql gotchas (asyncpg driver)

- Every `sql/queries.sql` must be loaded with `aiosql.from_path(..., "asyncpg", mandatory_parameters=False)` — otherwise aiosql demands a parameter-list signature in every `-- name:` line.
- A query with no `^`/`$`/`!` suffix (select-many) returns an **async generator**, not an awaitable — consume it with `[row async for row in queries.some_query(conn)]`, not `await`.
- `asyncpg.Record` isn't Pydantic-compatible (no attribute access), so every `repository.py` function converts its result to a plain `dict`/`list[dict]` before returning — never return a raw `Record` up through `service.py` into a `response_model`.
- asyncpg has no dict↔`jsonb` codec configured, so any `JSONB` column (`sale_changes.changed_fields`, `adjustment_requests.payload`) is passed in as `json.dumps(value, default=str)` (the `default=str` covers UUID/datetime values that show up in diffs) with the query casting it explicitly (`:param::jsonb`), and read back with `json.loads(...)` in the repository function before returning — never pass a raw dict as a bind parameter or return the raw JSON string up to `service.py`.
- Aggregate money queries (`SUM(amount)` over a `BIGINT` column) must be cast explicitly (`::bigint`) — Postgres's `SUM(bigint)` returns `NUMERIC`, which asyncpg maps to `decimal.Decimal`, not `int`. Without the cast the value is numerically correct but violates the BIGINT/no-float-or-numeric money convention once it reaches Python/Pydantic.
