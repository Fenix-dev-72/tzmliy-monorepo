# Tzmliy monorepo — agent context (root)

This file exists so a fresh AI assistant can pick up this project without needing prior conversation history. It consolidates everything accumulated across past sessions (project state, decisions, deployment info, known issues). Module-specific conventions live in `backend/CLAUDE.md` and `frontend/CLAUDE.md` — read those too before editing code in each area. This file is the "what happened and why" layer; those two are the "how this codebase works" layer.

Repo: multi-tenant B2B SaaS (sales, finance, CRM, calls, analytics) for the Uzbek market. `backend/` = FastAPI modular monolith (Python 3.13, PostgreSQL, Redis, MinIO, Celery). `frontend/` = React + TypeScript + Vite SPA. They deploy independently; frontend talks to backend over plain HTTP (`VITE_API_BASE_URL`).

Owner is a non-technical business stakeholder (G'iyosiddin) who communicates requirements in Uzbek, often informally/by voice-to-text transcript. The developer using this assistant (Fenix-dev-72 / user) drives iteration via prompt+screenshot pairs, mostly on the frontend now. Conversations with the assistant are conducted in Uzbek.

---

## Production deployment (current, as of 2026-08-10)

- **Live at**: `tizimly.uz` (domain registered, DNS points here). Server: `212.115.110.84` (hostname `tizimly`, Ubuntu 24.04, 8 vCPU / 7.8GB RAM / 50GB disk, dedicated — not shared).
- **SSH**: `ssh root@212.115.110.84`, password-based (no key). Password rotates — if login fails, ask the user for the current one. Use paramiko from Windows (no `sshpass`/key locally). SSH channel reads can spuriously `PipeTimeout` even when the remote command succeeded — re-check state with a fresh short call rather than assuming failure.
- **Architecture**: Docker Compose (`docker-compose.prod.yml` at repo root), NOT native systemd. Services: `postgres` (18, volume at `/var/lib/postgresql` not `.../data`), `redis`, `minio`, `pgbouncer` (transaction pooling, internal only), `app` (uvicorn --workers 8, uvloop+httptools), `celery_worker` (--concurrency=4), `celery_beat`. Frontend is NOT a container — built via `frontend/Dockerfile`'s `export` stage, then `docker create`+`docker cp` extracts static files to `/var/www/tizimly`, served by host nginx.
- **Old VPS** (`89.43.33.8`, shared with an unrelated project, native systemd) — deliberately left running untouched, not decommissioned. Don't touch without asking. `README.md` at repo root still references this old box as "staging" — that reference is stale, ignore it.
- **Redeploy steps**: see `project_vps_deployment` history below (or ask — full step-by-step tar/SFTP/docker-compose commands were used repeatedly and work reliably). Short version: tar the working tree (exclude `.venv`, `__pycache__`, `.env`, `node_modules`, `dist`, `.git`), SFTP to `/root/tizimly`, `docker compose -f docker-compose.prod.yml up -d --build app celery_worker celery_beat` for backend, Dockerfile export+docker cp dance for frontend, `docker compose ... run --rm app python -m app.db.migrate` for DB changes, `nginx -t && systemctl reload nginx` only if nginx config itself changed.
- **TLS**: real Let's Encrypt cert, auto-renews via certbot timer.
- **Platform Admin login**: `admin@tizimly.uz` (password not repeated here — rotate/retrieve via the user). 2FA is enabled on this account; TOTP secret lives server-side only at `/root/loadtest/platform_totp_secret.txt` on the VPS.
- **Backups**: daily Postgres `pg_dump` → sent to Telegram via a Platform-Admin-configured bot (not hardcoded — admin sets bot token/chat ID through `/platform/backup-settings`). Celery Beat job at 03:00. Logical dumps only, no PITR, ~50MB Telegram cap. Dashboard shows a warning banner if unconfigured or last run failed.
- **Known perf ceiling** (measured, not guessed — see `backend/optimize.md` for full methodology): ~1750-1850 req/s sustained on simple endpoints, CPU-bound (confirmed via vmstat, not I/O or pool-limited). At realistic per-role mixed traffic: 2700 concurrent simulated employees (~300 tenants) = 100% success, 632-1063 req/s depending on test tool, backend CPU well under saturation. True ceiling above ~300-tenant scale is unmeasured — every load-test attempt above that has been bottlenecked by the *test client* (laptop), not the server; three independent tools (threading, aiohttp, Locust) converged on the same client-side ceiling around 3000-5000 concurrent connections. **Do not conclude the server can't handle more — the server was never the limiting factor in any test run.** Getting a real number requires a Linux-based or genuinely distributed load client.
- **Do not raise `DB_POOL_MAX_SIZE` as a fix for high-concurrency degradation** — tried once (25→40), made things worse (more raw Postgres backend processes → more contention). If connection pressure is real, tune PgBouncer instead.

---

## Product requirements vs. what's built

Checked directly against the owner's chat requirements (as of 2026-07-25 audit) — all explicit asks were met:
- Platform Admin = super admin ✅, RBAC ✅
- CRM integration via **API/pull, not webhook** (owner's most-repeated demand) ✅ — AmoCRM+Bitrix24 OAuth + periodic pull; old CRM webhook endpoint returns 410 Gone.
- CRM credentials per-tenant (not env-wide) ✅, Meta Ads OAuth ✅, multi-tenant isolation via RLS ✅ (owner originally imagined literal per-tenant mini-DBs; RLS is the correct industry-standard equivalent — see `multi-tenant-xavfsizlik-hisobot.md`), call providers Utel + Moi Zvonki ✅.
- **OnlinePBX is explicitly OUT OF SCOPE** — was on an early checklist, owner said 2026-07-25 it's not needed. Don't re-flag it as a gap.
- Warehouse stats the owner specifically asked for (overstock, slow-moving, total stock value) — built 2026-07-25: `GET /api/v1/products/warehouse-stats`, shown as a 3-card row on `WarehousePage`.
- Domain note: owner said `app.tizimly.uz` was registered (2026-07-13), but production actually runs on plain `tizimly.uz`. Moving to the `app.` subdomain would be a DNS+nginx+cert task if ever requested.
- Cannot verify with available tooling: voice-message handling (no audio processing), Lovable.dev design references (unless pasted as images).

---

## Billing / plans system (built 2026-08-09/10, most recent major feature)

`billing_plans` went from 3 hardcoded rows (`starter`/`business`/`enterprise`, PATCH-only) to fully Platform-Admin-creatable plans **with real enforcement**, not just marketing copy. Two passes, both deployed:

**Pass 1** — CRUD: migration `0056` loosened the `code` CHECK to a slug pattern, added `features_uz`/`features_ru`/`is_popular`. New `POST /platform/v1/billing/plans` (2FA+audit-gated) and unauthenticated `GET /api/v1/billing/plans/public` (landing page reads live data). New `/platform/billing-plans` admin page + "Tariflar" card on the Platform Admin dashboard.

**Pass 2** — real limits (user's exact complaint: trial wasn't a real plan, `max_users` was never checked, `features_uz` was just unenforced text, storage limit only logged a warning instead of blocking, no per-tenant storage visibility for Platform Admin, storage UI was in raw bytes):
- Migration `0057`: `billing_plans` gained `is_trial BOOLEAN`, `trial_days INTEGER` (paired CHECK + partial unique index — only one trial plan can exist at a time), `feature_keys TEXT[]` (machine-readable, separate from marketing-copy `features_uz/ru`). Seeded `code='trial'` (0 UZS, 15 days, 3 users, 1GB).
- **Trial-as-real-plan**: `billing/service.py`'s `assign_trial_subscription` creates a real `tenant_subscriptions` row at tenant creation, wired into both the Platform-Admin-provisioned path (`tenants/service.py`) and self-service registration (`auth/service.py`). Both sync `tenants.trial_ends_at` too since `run_dunning` still reads that column directly.
- **`max_users` enforcement**: `auth/users_service.py`'s `create_user` checks the plan before inserting a new employee (skipped for tenant-bootstrap admin creation) → `UserLimitReachedError` → HTTP 409.
- **Feature gating**: fixed catalog in `billing/features.py` (`crm_integrations`, `meta_ads`, `telegram_notifications`, `advanced_reports`) + `billing/deps.py`'s `require_plan_feature(key)` — a **live DB check per request**, deliberately not cached in the JWT like RBAC permissions, because a plan change must take effect immediately. Applied to CRM/Meta-Ads/Telegram-config/report-export endpoints. `GET /api/v1/billing/entitlements` is the single source of truth the frontend reads.
- **Storage: real blocking**. Daily Celery Beat job (03:30) recomputes every tenant's usage. `enforce_storage_not_exceeded` reads the latest snapshot (cheap, never recomputes inline) and blocks product-photo uploads + report-export enqueueing with HTTP 402 at/over 100%. Deliberate exception: **call recordings are never blocked** — losing a real customer call is worse than temporarily exceeding quota; still counted, just never rejected.
- **Platform Admin storage visibility**: `GET /platform/v1/dashboard/storage-usage` + new "Xotira" column with a usage bar on the Platform Admin dashboard.
- **Frontend**: `lib/format/storage.ts` (byte↔MB/GB conversion, same convention as money formatting), `EntitlementsContext` feeding sidebar lock/"Premium" badges and a new `/dashboard/settings/billing` page. `IntegrationsPage` is gated behind `FeatureGate` (OR-logic across CRM+Meta-Ads) since it's single-purpose; Notifications/Reports pages were deliberately NOT full-page-gated (they mix gated and ungated functionality) — only the specific gated actions 402/403 server-side.

**Maintenance note**: the feature-key catalog is manually duplicated in two places that must stay in sync — `backend/app/modules/billing/features.py` and `frontend/src/lib/billing/features.ts`. A new gated capability needs a key added to both, `require_plan_feature` wired onto the relevant endpoint, and a judgment call on full-page vs. in-page gating.

Still deliberately not done: real Click/Payme merchant credentials (user must supply their own).

---

## Quick module map (backend `app/modules/<name>/`, each is router.py+service.py+repository.py+sql/queries.sql)

| Module | Covers |
|---|---|
| `auth` | login/OTP/2FA/password-reset (`service.py`), Tenant-Admin user CRUD (`users_service.py`), roles/RBAC (`roles_service.py`) |
| `tenants` | tenant creation (self-service + Platform-Admin path), `trial_ends_at` |
| `catalog` | adjustency-list category tree, fixed/cost price per category |
| `products` | stock levels, photo upload (WebP conversion), warehouse stats |
| `customers` | leads/customers (same row, `stage` column), `crm_activities` (manual notes, internal — not the `crm` module) |
| `sales` | the contract row: price/deadline/status, optimistic concurrency (`version`), `sale_changes` history |
| `finance` | payments, append-only `ledger_entries`, refund/tariff-change approval workflow, bonus plans + payroll (background job) |
| `calls` | UTEL + Moi Zvonki webhooks, recordings (MinIO), attendance |
| `billing` | platform's OWN SaaS revenue (plans, trial, Click/Payme, storage enforcement) — not `finance` |
| `notifications` | per-tenant Telegram bot, PDF reports, retry/dead-letter outbox |
| `analytics` | dashboard summary, SSE leaderboard, dashboard-only passwordless kiosk auth |
| `crm` | AmoCRM/Bitrix24/Meta Ads — external pull integrations (distinct from `customers.crm_activities`) |
| `reports` | diagnostics (5 fixed anomaly checks) + CSV/XLSX export (background job) |
| `backups` | daily pg_dump → Telegram, Platform-Admin-configured |
| `platform_dashboard` | Platform Admin's own summary/tenant-list/storage-usage views |

`app/core/` = cross-cutting infra only (config, database/RLS helpers, crypto, storage, notify, middleware, celery_app) — no business logic there.

## Frontend page map (`frontend/src/pages/`)

- `landing/` — public marketing site (`/`)
- `tenant-auth/` — `/login/*`, `/register/*` (4-step self-service signup, see `frontend/CLAUDE.md`)
- `dashboard/` — the full tenant console, ~29 pages (Sales, Finance, Customers, Products/Warehouse, Users, Roles, Calls, Attendance, Reports, Notifications, Integrations, Sellers/KPI, Support, `settings/billing`, kiosk at `/tv`)
- `platform-auth/` + platform console — `/platform/*`, separate auth context, mandatory 2FA

**`frontend/CLAUDE.md` has one stale line**: it references API docs at a sibling repo path (`dashboarduz\FRONTEND.md`) from before this became a monorepo — the real file is `backend/FRONTEND.md` in this same repo. Don't chase the old path.

## If you need to know X, read Y (skip re-deriving from scratch)

| Need to know... | Read |
|---|---|
| Exact endpoint shapes / which page calls what | `backend/FRONTEND.md` |
| Backend module conventions, RLS/money/idempotency rules | `backend/CLAUDE.md` |
| Frontend auth/routing/design-token conventions | `frontend/CLAUDE.md` |
| Responsive layout / nav breakpoint rules | `.claude/skills/frontend-responsive` (skill) |
| What's deployed where, how to redeploy | this file's "Production deployment" section above |
| Perf numbers / what's already been tried | `backend/optimize.md`, `test.md` (root) |
| Full historical security audit | `C:\Users\Samandar\.claude\plans\butun-loyhani-audit-qil-validated-feigenbaum.md` |
| Local dev setup from zero | root `README.md` |

---

## How results in this file were actually produced (test/benchmark tooling)

**Automated correctness tests** — `pytest` suite in `backend/tests/` (currently ~33+ tests, grows with each feature). Run via:
```
docker compose up -d postgres          # + python -m app.db.migrate if needed
pip install -r requirements-dev.txt
python -m pytest tests/ -v
```
Covers RLS tenant-isolation (`test_rls_isolation.py`, drives the real `tenant_connection` as the NOBYPASSRLS `app_user` role — not mocked), auth/JWT/2FA security (`test_auth_security.py`, DB-free), HTTP integration (`test_auth_http.py`, via `httpx.ASGITransport`), plus one test file per feature area added since (billing limits, warehouse stats, worker reaper, etc.). Skips (doesn't fail) if the DB is unreachable. Wired into CI (`ci.yml`'s `backend-tests` job, real postgres:18 service).

**Load/perf testing — four different tools were used across sessions, in this order, because each one hit its own ceiling before the server did:**
1. **`wrk`** (2026-08-08, first pass) — simple C-based HTTP benchmarker, run directly against one endpoint (`/auth/register/request-code`) to find the raw CPU ceiling. Found the real ~1750-1850 req/s plateau, confirmed CPU-bound via `vmstat` (`steal=0%`, `us+sy≈90%`). Gotcha: hammering an OTP-sending endpoint at scale queued 744k real Celery email tasks and got the SMTP account rate-limited by Gmail — never load-test an endpoint that sends a real email/SMS.
2. **Custom Python `threading`-based script** (2026-08-09, "realistic-mix" test) — simulated per-role weighted traffic (not one endpoint) against a throwaway Platform-Admin-provisioned tenant (no email step, so no SMTP risk). Hit its own ceiling around 5400 concurrent (GIL/thread-count overhead) before the server did — this is why "run from the VPS itself, not a laptop" was the finding at this stage (the laptop's network/threading was the bottleneck, confirmed by comparing 252 req/s from a laptop vs. 609 req/s for the identical run from the server).
3. **Custom Python `asyncio`+`aiohttp` script** (2026-08-09, 1000-tenant scale attempt) — rebuilt for lower per-connection overhead than `threading`. Revealed a *different* problem: running the load client ON the same server as the app risked OOM (the aiohttp client itself used ~2.9GB RSS at ~10k connections and got OOM-killed once) — so the client was moved back OFF the server, onto the user's own laptop, this time deliberately (opposite of step 2's finding — the lesson isn't "always run from X", it's "run the client somewhere that can't starve the server or itself").
4. **Locust** (2026-08-09, final/authoritative pass) — industry-standard, chosen specifically as a third independent tool to settle whether the ~62-64% success-rate ceiling seen in step 3 was the server or the client. Master+worker processes run manually (Windows can't fork, so `--processes` doesn't work — workers started as separate manual processes). Confirmed once and for all it was the client: server CPU stayed at 15-23% even as client-side `ConnectTimeoutError`s piled up past 5400 concurrent. **This is the tool/number to cite if asked about capacity** — 2700 concurrent (~300 tenants): 98.23% success, 1063 req/s, p50=140ms, full stage table in `test.md`/`backend/optimize.md`#33.

Two tool-specific false alarms worth knowing if these tools are ever reused: Locust's default `FastHttpUser` (gevent) added a spurious 10-56s delay per request **on Windows specifically** — switch to plain `HttpUser` (requests-based) on Windows; and a 15-minute JWT access-token TTL expired mid-test in one long run, producing spurious 401s — refresh tokens before each new stage of a multi-stage test.

All load-test tenants (seeded customers/sales/employees) were hard-deleted from production after every round — verified via `SELECT count(*) FROM tenants WHERE id = ...` returning 0. Any future load test against production must do the same cleanup.

---

## Known gotchas / hard-won lessons

- **RLS + migration backfills**: a migration that does `INSERT INTO <force-rls-tenant-table> SELECT ...` silently touches 0 rows on production, because the migrations-runner role (`dashboarduz_owner`) is NOT a superuser on prod (unlike local Docker, where it is) and no `app.tenant_id` is set. Any future backfill into an RLS/FORCE table must either run as the postgres superuser directly, or loop per-tenant with `SELECT set_config('app.tenant_id', <id>, false)` before each tenant's insert.
- **nginx path prefixes**: platform-admin API routes live under `/platform/v1/`, NOT `/platform/`. A `location /platform/` block will greedily swallow the frontend's own client-side routes (`/platform/dashboard`, `/platform/login`, etc.) and 404 them on direct navigation/refresh — only in-app `<Link>` nav would still work, masking the bug. Always scope nginx platform-API proxying to the exact `/platform/v1/` prefix.
- **MinIO / storage downloads**: nginx needs `location /storage/ { proxy_pass http://127.0.0.1:9000/; }` (trailing slash matters — strips prefix for correct path-style S3 addressing) or presigned download URLs silently fail.
- **`backend/.env` (local, gitignored) does NOT mirror production** since the 2026-08-08 migration to the new VPS — production secrets were regenerated fresh for the new box. Don't treat the local `.env` as "what prod has" for anything after that date; the real source of truth is the new server's own `/root/tizimly/.env`.
- **Load-testing**: never point a load generator at an endpoint that triggers a real outbound email/SMS (registration OTP, password reset) — one test run queued 744k real Celery email tasks and got the SMTP account rate-limited by Gmail. Use a Platform-Admin-provisioned tenant (no email step) instead. Always run the load-generation client on a separate machine from the server (or accept the client itself becomes the bottleneck).

---

## Skills / tooling patterns used in this repo's sessions

Claude Code auto-lists all available skills at session start — no need to pre-load anything. Quick reference for which ones matter for *this* repo specifically:

- **`frontend-responsive`** (project skill, `.claude/skills/frontend-responsive`) — conventions for responsive layout/scroll behavior (mobile/laptop/desktop) in `frontend/src`. Always load before touching a page, layout, or nav component — covers the `lg:` (1024px) breakpoint where nav structure itself swaps (mobile bottom-nav+sheet ↔ desktop hover-rail sidebar), `min-w-0` on flex children to avoid horizontal scroll, and internal-scroll-panel conventions.
- **`code-review`** — run after any non-trivial backend or frontend change before considering it done; this repo has a history of real bugs caught this way (race conditions, RLS gaps, idempotency holes — see the Security hardening pass in `backend/CLAUDE.md`).
- **`security-review`** — worth running for anything touching auth, payments (billing/Click/Payme), webhooks, or RLS policies — this codebase is security-sensitive (multi-tenant isolation via RLS, financial ledger, encrypted credentials) and past audits found real issues each time.
- **`run`** — use to actually start and click through the app before claiming a frontend change works, per this project's own standing rule (see "Doing tasks" in the system prompt) — screenshots/prompts are how the user validates UI work.
- General skills (`claude-api`, `artifact-design`, etc.) apply only if that specific task comes up (e.g. building a one-off dashboard/report artifact) — not part of the day-to-day backend/frontend loop here.

Frontend iteration workflow: user sends a prompt + screenshot of a UI issue → read the relevant `frontend/src/pages/dashboard/*` component → edit → `npx tsc --noEmit` + `npx vite build` before considering done → deploy if requested.
- Backend changes: add/adjust migration under `backend/app/db/migrations/`, update `repository.py`/`sql/queries.sql`/`service.py`/`router.py`/`schemas.py` together (see `backend/CLAUDE.md` for the module layout convention), add/update tests under `backend/tests/`, run the suite before deploying.
- Deploys to the live VPS are **manual tar+SFTP+docker compose**, not git-pull-based — there's no deploy key on the server pulling from GitHub. Always ask before deploying to production unless the user has already said to proceed autonomously for that specific change.
- Full historical audit report (2026-07-25, mostly resolved) lives at `C:\Users\Samandar\.claude\plans\butun-loyhani-audit-qil-validated-feigenbaum.md` — mature codebase overall (RLS isolation solid, secrets encrypted, no SQL injection, XSS-clean frontend), all findings from that pass were fixed and deployed.
- Detailed load-test writeups and the running perf-optimization log: `backend/optimize.md` (root) and `test.md` (root).

---

## External integration URLs / endpoints reference

Every third-party base URL actually used in the code, gathered in one place so nobody has to grep for them again. None of these are secrets — the secrets (tokens/keys) live in `.env`/prod `.env`, never here.

**CRM**
- AmoCRM OAuth authorize: `https://www.amocrm.ru/oauth` (`crm/oauth.py`) — subdomain-specific, this is the shared entry point.
- Bitrix24 OAuth token endpoint: `https://oauth.bitrix.info/oauth/token/` (`crm/oauth.py`) — used for both the initial exchange and refresh.
- Bitrix24 lead-push: incoming-webhook URL is pasted in whole by the tenant (stored in `integration_credentials.api_key_encrypted`) — no fixed base URL, it's tenant-specific.
- Meta Ads / Meta Graph API base: `https://graph.facebook.com/v21.0` (`crm/meta_ads.py`'s `_API_BASE`, version pinned via `_META_ADS_API_VERSION` in `crm/oauth.py`).
  - OAuth dialog: `https://www.facebook.com/{version}/dialog/oauth`
  - Token exchange: `https://graph.facebook.com/{version}/oauth/access_token`

**Calls**
- UTEL: no shared host — per-tenant subdomain, `https://api.{subdomain}.utel.uz/api/v1` (`calls/utel_client.py`). OpenAPI spec confirmed live at `https://api.dev.utel.uz/docs/api` (2026-07-17). Dashboard itself is at `https://{subdomain}.utel.uz/dashboard` (e.g. `https://cc341.utel.uz/dashboard`), a different host from the API.
- Moi Zvonki ("Мои звонки"): per-tenant `domain`, e.g. `https://test.moizvonki.ru/api/v1` (`calls/moi_zvonki_client.py`) — spec confirmed against `https://www.moizvonki.ru/guide/api/` (2026-07-17).

**Billing (platform's own Payme/Click merchant, not tenant CRM creds)**
- Payme checkout redirect: `https://checkout.paycom.uz/{base64-encoded-params}` (`billing/service.py`).
- Click checkout redirect: `https://my.click.uz/services/pay` (`billing/service.py`).

**Notifications**
- Telegram Bot deep links (bot-linking flow): `https://t.me/{bot_username}?start={token}` and `...?startgroup={token}` (`notifications/service.py`, `backups/service.py`).
- Telegram Gateway API (real phone-OTP delivery, platform-level, not per-tenant): base `https://gatewayapi.telegram.org` (`core/notify.py`'s `_GATEWAY_API_BASE`) — token obtained from `https://gateway.telegram.org/` account settings, set as `TELEGRAM_GATEWAY_API_TOKEN`.

**Infra (self-hosted, not third-party SaaS)**
- Local/dev object storage (MinIO): `http://localhost:9000` (`.env.example`'s `OBJECT_STORAGE_ENDPOINT_URL`). Production serves the same bucket through nginx at `https://tizimly.uz/storage/` (see the VPS deployment section above) — the app itself still talks to MinIO's S3 API directly (`http://127.0.0.1:9000` inside the Docker network), the `/storage/` path is only for serving presigned-URL downloads to end users.
- Local dev DB/Redis: `postgresql://...@localhost:5432/dashboarduz`, `redis://localhost:6379/1` (OTP/session storage, DB index 1) and `/2` (Celery broker, DB index 2) — see `.env.example` for the full block.

**Official docs consulted while building each integration** (reference/spec sources, confirmed via live fetch during development — not runtime endpoints, but where the request/response shapes and auth schemes came from; worth re-checking these if a provider's behavior ever seems to have changed):
- UTEL OpenAPI spec: `https://api.dev.utel.uz/docs/api` (confirmed live 2026-07-17).
- Moi Zvonki API guide: `https://www.moizvonki.ru/guide/api/` (confirmed live 2026-07-17).
- Meta Graph API (Marketing Insights): `developers.facebook.com` — insights endpoint shape `GET https://graph.facebook.com/v.../{resource-id}/insights`.
- Payme Merchant API: `developer.help.paycom.uz` (confirmed live) — JSON-RPC 2.0 spec (`CheckPerformTransaction`/`CreateTransaction`/`PerformTransaction`/`CancelTransaction`/`CheckTransaction`).
- Click Merchant API: `docs.click.uz` — sourced from stable community docs, **not** live-fetched in full; flagged in `backend/CLAUDE.md` to re-verify against `docs.click.uz` / Click's merchant cabinet during real sandbox onboarding, same caveat as UTEL's original placeholder stage.
- Telegram Gateway API (phone OTP): `https://core.telegram.org/gateway` (spec) + `https://gateway.telegram.org/` (account/token page).
- Bitrix24 REST docs: incoming-webhook method used is `crm.lead.add`, confirmed against Bitrix24's own REST API during Faza 11 (exact doc URL not preserved in code comments — re-derive from `oauth.bitrix.info` if needed).
- AmoCRM: classic webhook scheme (shared-secret query param, not HMAC-signed) — per `crm/providers.py`'s comments, AmoCRM's own webhooks genuinely aren't signed; re-verify against `amocrm.ru/developers` during real sandbox onboarding, since this one couldn't be confirmed via live fetch in-session.

**Our own callback / webhook URLs (registered with each provider, production = `https://tizimly.uz`)** — built from `oauth_redirect_base_url` (OAuth callbacks) or `frontend_base_url` (post-OAuth browser redirects). These are the exact URLs to paste into each provider's own developer console when configuring the integration in production:
- AmoCRM OAuth redirect URI: `https://tizimly.uz/api/v1/crm/oauth/amocrm/callback`
- Bitrix24 OAuth redirect URI: `https://tizimly.uz/api/v1/crm/oauth/bitrix24/callback`
- Meta Ads OAuth redirect URI: `https://tizimly.uz/api/v1/crm/oauth/meta_ads/callback`
  - (generic pattern: `{oauth_redirect_base_url}/api/v1/crm/oauth/{provider}/callback`, `crm/service.py`'s `_oauth_redirect_uri`)
  - After token exchange, the backend itself redirects the tenant's browser back to `https://tizimly.uz/dashboard/integrations?connected={provider}` (success) or `?oauth_error={provider}` (failure) — `crm/router.py`'s `oauth_callback`.
- CRM inbound lead webhooks (AmoCRM/Bitrix24 push leads to us): `https://tizimly.uz/api/v1/crm/webhooks/{provider}/{tenant_id}` — tenant-specific, shown to the tenant in the Integrations UI once connected.
- UTEL call webhook: `https://tizimly.uz/api/v1/calls/webhooks/utel/{tenant_id}?secret={secret}` — registered automatically via `utel_client.register_webhook` when the tenant connects (not manually pasted).
- Moi Zvonki call webhook: `https://tizimly.uz/api/v1/calls/webhooks/moi_zvonki/{tenant_id}?secret={secret}` — same, auto-registered via `moi_zvonki_client.subscribe_webhook`.
  - (generic pattern for any future call provider: `{oauth_redirect_base_url}/api/v1/calls/webhooks/{provider}/{tenant_id}`, `calls/service.py`)
- Payme webhook (platform's own merchant account, one URL for all tenants — not per-tenant): `https://tizimly.uz/api/v1/billing/webhooks/payme` — JSON-RPC endpoint, registered once in Payme's merchant cabinet.
- Click webhook (same, platform-level): `https://tizimly.uz/api/v1/billing/webhooks/click` — registered once in Click's merchant cabinet; `merchant_trans_id` we send back is `{tenant_id}:{payment_id}` so Click's callback always carries tenant_id directly.
- Password-reset email link (not a provider callback, but a self-issued URL worth knowing): `https://tizimly.uz/login/reset?identifier=...&token=...` (`auth/service.py`).
- Telegram bot-linking deep links (opened by the tenant, not registered anywhere): `https://t.me/{bot_username}?start={token}` (link a personal chat) / `?startgroup={token}` (link a group).

**No integration logo/icon image assets exist in the codebase** — the landing page and dashboard integration cards (`frontend/src/pages/landing/sections/IntegrationsSection.tsx`, `frontend/src/pages/dashboard/IntegrationsPage.tsx`) render `lucide-react` icon components with a per-provider hex color (e.g. amoCRM `#4C6FFF`, Bitrix24 `#10B981`, Meta Ads `#0866FF`, UTEL `#F97316`, Telegram `#26A5E4`), not real provider logos/images. If real logos are ever wanted, they'd need to be sourced/licensed and added as new asset files — nothing to "find" in the current repo.

---

## Explicitly out of scope / do not do

- Do not attempt a Go (or other language) rewrite of the backend unless explicitly re-requested — evaluated once (2026-08-10): the measured bottleneck is Postgres/network I/O, not language choice, and the app is already CPU-headroom-rich at realistic scale. If Go experiments are ever requested again, keep them **isolated from the real project files** (a separate reference file / scratchpad only) unless the user explicitly says otherwise — this was a hard constraint given in a past session.
- Do not re-flag OnlinePBX as a missing integration — explicitly declined by the owner.
- Do not treat `backend/.env` as authoritative for production config (see gotchas above).
