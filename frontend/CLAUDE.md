# Tzmliy Frontend

React + TypeScript SPA for **Tzmliy** — a multi-tenant B2B SaaS platform (sales, finance, CRM, calls,
analytics) built on top of the `dashboarduz` backend. This repo covers the **public landing page**, the
**tenant auth flow** (login + self-service registration, see below), a **full tenant dashboard**
(`/dashboard/*` — see the page list below), a **Live Leaderboard kiosk** (`/kiosk`), the **platform admin
auth flow**, and a **platform admin console** (`/platform/*`).

> **Doc status (updated 2026-07-25):** the tenant dashboard is now built out, not "analytics summary only"
> as earlier revisions of this file said. `src/pages/dashboard/` currently ships pages for Sales, Finance,
> Customers, Products/Warehouse, Users, Roles, Calls, Attendance, Reports, Notifications, Integrations
> (CRM/Meta Ads), Sellers/KPI, Support, 2FA settings, and the main analytics `DashboardPage`. Treat the
> "future phases" note under **Scope** as historical — most of it is done. If a specific page is missing a
> feature, check the page file itself rather than trusting this summary.

## Tech stack

- React 18 + TypeScript, Vite 8
- Tailwind CSS 4, CSS-first `@theme` config (no `tailwind.config.js`) — tokens live in `src/styles/theme.css`
- React Router 7 (`createBrowserRouter`, routes in `src/router.tsx`)
- A handful of vendored/adapted shadcn-style primitives in `src/components/ui/` (button, input, label, tabs,
  input-otp, sonner) built on the specific Radix primitives each one needs
- `qrcode.react` for rendering the 2FA `otpauth_uri` as a scannable QR code
- `recharts` for dashboard charts (`CourseSalesPage`, `SalesTrendCharts`, `SellersPage`, `KpiCard`)
- Plain `useState`-driven forms with manual validation — **not** `react-hook-form`/`zod`. Those were
  installed during initial planning but never wired in because hand-rolled state was sufficient; they were
  uninstalled again once confirmed unused. Don't reinstall them speculatively — add them when a form
  actually needs schema validation complex enough to warrant it.

**Removed 2026-07-25** (were leftover from the original Figma-Make design export, never imported anywhere in
`src/`): `three`, `@react-three/fiber`, `@react-three/drei`, `@types/three`, `gsap`, `lenis`. Dropped from
`package.json` to slim the install. If a future page genuinely needs 3D/animation, re-add the specific one
then. (`recharts` used to be in the "not installed" list — it is now installed *and* used, per the bullet above.)

**Deliberately not installed**: `@mui/*`, `@emotion/*`, most Radix primitives beyond label/slot/tabs/dialog,
`react-day-picker`, `react-dnd*`, `embla-carousel*`, `react-slick`, `canvas-confetti`, `vaul`, `cmdk`,
`react-resizable-panels`, `react-responsive-masonry`, `next-themes`, `date-fns`, `@popperjs/core`, `motion`.
Add each back only when a page genuinely needs it — don't bulk-install because an old reference file mentions them.

## Env config

- `VITE_API_BASE_URL` — the only place the backend base URL is ever set. Never hardcode it elsewhere.
- `.env.local` (gitignored) currently points at the staging backend: `http://89.43.33.8:8001`.
- Backend API contract lives in a sibling repo: `C:\Users\Samandar\PycharmProjects\dashboarduz\FRONTEND.md`.
  That file is the source of truth for endpoint shapes, error formats, and the full auth sequence — read it
  before changing anything under `src/lib/api/`.

## Auth flows

Two fully independent auth contexts — never mix them:

- **Tenant** (`src/lib/auth/tenantAuthStore.tsx`, routes under `/login/*` and `/register/*`): a single
  `identifier` (email **or** phone, backend infers which) + password, or phone/OTP, optional per-user 2FA.
  **No `tenant_slug` anywhere** — `users.email`/`users.phone` are globally unique on the backend now
  (2026-07-09), so the server resolves which tenant a login belongs to from the identifier alone. `/login/reset`
  is a real deep-linkable route (not view-state) because it's reached via an emailed password-reset link — the
  link now carries `?token=...&identifier=...` (not `tenant_slug`).
- **Platform Admin** (`src/lib/auth/platformAuthStore.tsx`, routes under `/platform/*`): email/password only,
  no `tenant_slug`, **mandatory** 2FA before any privileged action — `/platform/2fa-setup` is a post-login
  gate reached automatically when `totp_enabled` is false. `/platform/login` is intentionally not linked
  from the public landing nav (`Navbar.tsx`) — it's an internal tool for the Dashboarduz team.

Both stores follow the same pattern: access token **in-memory only** (short TTL, carries permission claims,
kept out of `localStorage` to limit XSS blast radius), refresh token in `localStorage` under separate keys
(`tzmliy_tenant_refresh`, `tzmliy_platform_refresh`). On app boot each provider silently calls its own
`refresh()` if a stored refresh token exists. This is a conscious tradeoff, not an oversight — the backend
contract is bearer-token-in-body, not httpOnly cookies, so cookie storage isn't actually available without a
backend change.

**Kiosk is the one deliberate exception** (`DashboardKioskPage.tsx`, `/tv`): its access token *is* persisted
in `localStorage` (`tzmliy_dashboard_session`). A kiosk is a wall-mounted TV that must survive a reboot and
return to the leaderboard with nobody there to re-log-in. The blast radius is tiny by design — it's a
dashboard-session token, the lowest-privilege JWT audience (read-only, single-tenant, leaderboard-only, no
permissions, no writes), and the only data it unlocks is the leaderboard already shown publicly on that
screen. Don't "fix" this to in-memory storage; see the comment on `STORAGE_KEY` in the page.

`src/lib/api/client.ts` exposes a `newIdempotencyKey()` helper (`crypto.randomUUID()`) that no current
endpoint needs yet — it's there so the pattern already exists when a future dashboard phase adds
`POST /sales`, `POST /finance/payments`, etc., all of which require an `Idempotency-Key` header per
`FRONTEND.md`.

**Gotcha confirmed against the live backend**: platform access tokens carry **no `totp_enabled` claim**
(decoded a real one — only `sub`/`type`/`iat`/`exp` are present), unlike what `FRONTEND.md`'s general claims
note might suggest. `platformAuthStore.tsx`'s `totpEnabled` state is therefore tracked from *which auth step
succeeded* (login's `requires_2fa` flag, or a successful `confirm2fa()`/verify-login call), never by decoding
the token. Don't reintroduce JWT-claim decoding into the **platform** auth flow — it caused a real bug
(infinite redirect loop between `/platform/2fa-setup` and `/platform/welcome`, plus a StrictMode
double-`/2fa/setup`-call side effect).

`src/lib/auth/jwt.ts` was deleted during that fix but has since been reintroduced for a narrow, unrelated
purpose: `DashboardKioskPage.tsx` decodes a kiosk-session token's `exp` client-side to know when to prompt
re-login (it is the *only* importer as of 2026-07-25). That's a UI-convenience decode, not an authorization
decision — the backend remains the real authority. Keep it scoped to that; don't let JWT decoding creep back
into the tenant/platform permission logic.

## Self-service registration (reversed 2026-07-10 — read this before touching auth)

**This used to say "no registration flow, ever" — that rule is gone.** The backend was rebuilt on 2026-07-09
to support self-service tenant signup (the user explicitly corrected an earlier assumption that Platform
Admin should provision every tenant — see `dashboarduz`'s `dashboarduz-feedback-self-registration` memory for
the full story). If you find old references to "no register flow" anywhere else in this codebase or in
conversation history, they're stale — self-service registration is now the **primary** onboarding path.

**The flow** (`/register/*`, same `TenantAuthLayout` as `/login/*`), four routes:
1. `/register` (`RegisterView.tsx`) — identifier (email or phone) → `POST /auth/register/request-code`.
   Unlike login/OTP, a 409 here ("already registered") is shown directly — that's normal signup-form UX, not
   the account-enumeration risk login/reset have to avoid.
2. `/register/verify` (`RegisterVerifyView.tsx`) — 6-digit code (reuses `OtpCodeInput`) →
   `POST /auth/register/verify-code` → gets a short-lived `registration_token`, passed via router `state`
   (not the URL — it's a bearer credential, same reasoning as why access tokens stay out of `localStorage`).
3. `/register/complete` (`RegisterCompleteView.tsx`) — company name (+ auto-slugified, editable slug, same
   `slugify()` helper as `PlatformCreateTenantView`) + password → `POST /auth/register/complete` → returns a
   real `TokenPair` (auto-login, no separate `/login` round-trip) → `completeLogin()` → navigates to
   `/register/plan`.
4. `/register/plan` (`RegisterPlanView.tsx`) — trial-or-pay choice. "15-day free trial" just navigates to
   `/dashboard` (the backend already started the trial automatically at `complete`, via `tenants.trial_ends_at`
   defaulting to `now() + 15 days` — no separate API call needed for that path). Picking a paid plan calls a
   **new backend endpoint**, `POST /api/v1/billing/subscription` (tenant-self-service, `billing.view`
   permission only — deliberately *not* privileged/2FA-gated, since a just-registered admin has no 2FA yet),
   then the pre-existing `POST /api/v1/billing/payments/initiate` (which *is* `billing.manage`/2FA-gated).
   **Known gap**: this repo has no tenant-side 2FA-setup page yet (only Platform Admin has one,
   `PlatformTwoFaSetupView.tsx`) — so `initiatePayment` will 403 for every fresh registration today.
   `RegisterPlanView` catches that 403 and shows an inline "2FA required, continue with trial for now"
   message rather than dead-ending; building a tenant `/settings/2fa` page is the natural next phase once
   payment needs to actually complete.

**Landing page CTAs**: `Navbar.tsx`'s and `CTASection.tsx`'s "Bepul boshlash" / "Start free" buttons point to
`/register` now (were `/login`). `HeroSection.tsx`'s and `CTASection.tsx`'s "Demo so'rash" / "Request a demo"
buttons were left alone (still point wherever they pointed) — no real demo-request backend flow exists, and
that's a separate, unrelated question from registration.

The Platform-Admin-provisioned path (`/platform/tenants/new`, `PlatformCreateTenantView.tsx`) **still
exists and still works** — it's just not the primary path anymore. Keep it; it's a legitimate
support/enterprise-onboarding tool (e.g. a client who wants Dashboarduz's team to set them up directly).

## Design tokens

`src/styles/theme.css` — gold (`#D4AF37` dark / `#A9791E` light, muted-bronze on white so it doesn't read
"cheap") on navy-black (`#0A0E1A`) in dark mode (the default), white/`#F7F8FA` in light mode. Source spec:
the original Figma design brief that shipped alongside the design reference this was built from. Fonts:
Manrope (headings), Inter (body), JetBrains Mono (numeric/metric values) — loaded with an explicit
`&subset=cyrillic` Google Fonts param since the `ru` locale is in scope.

**Styling convention: Tailwind utility classes + `dark:`-driven tokens, not inline `style={{}}` objects.**
The one deliberate exception is genuinely runtime-computed values (e.g. `BrandPanel`'s per-bar chart height
`%`) — Tailwind can't express those without `style` anyway. New code should follow this convention so the
codebase doesn't end up with two parallel styling systems once dashboard pages are added.

`lang` (`"uz" | "ru"`) and `isDark` are both React context (`src/lib/i18n/LangContext.tsx`,
`src/lib/theme/ThemeContext.tsx`), not prop-drilled — every landing section and auth view reads them via
`useLang()` / `useThemeContext()` instead of taking `lang`/`isDark` props.

## Scope

**In scope now** (updated 2026-07-25):
- `/` landing page
- `/login/*` tenant auth (identifier + password, phone/OTP, forgot/reset) and `/register/*` self-service
  tenant registration (identifier → code → company+password → trial-or-pay)
- `/dashboard/*` — the full tenant console: the analytics `DashboardPage` (`GET /api/v1/analytics/summary`,
  `.../revenue-timeseries` with a Kunlik/Haftalik/Oylik toggle, `.../debt-summary`), plus Sales, Finance
  (payments/ledger/adjustments/bonus-plans/payroll), Customers, Products/Warehouse, Users, Roles, Calls,
  Attendance, Reports, Notifications, Integrations (CRM/Meta Ads OAuth), Sellers/KPI, Support, and tenant-side
  2FA settings (`TwoFactorSettingsPage.tsx`)
- `/kiosk` — Live Leaderboard kiosk (`DashboardKioskPage.tsx`, dashboard-session token)
- `/platform/*` platform admin auth + console, including `/platform/tenants/new` (two-step wizard:
  `POST /platform/v1/tenants` then `POST /platform/v1/tenants/{id}/admin-user`)

**Known gaps / still thin**: no global 401 interceptor or React `errorElement`/ErrorBoundary (an uncaught
render error white-screens the app); `SalesPage.tsx` (~1.1k lines) and `NotificationsPage.tsx` (~1k lines)
are monolithic and worth splitting; no ESLint/test tooling is wired in despite `eslint-disable` directives in
the source. Consult `FRONTEND.md` for the authoritative per-page API surface — it is the source of truth for
endpoint shapes, not this summary.
