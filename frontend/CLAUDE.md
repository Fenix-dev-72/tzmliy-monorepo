# Tzmliy Frontend

React + TypeScript SPA for **Tzmliy** — a multi-tenant B2B SaaS platform (sales, finance, CRM, calls,
analytics) built on top of the `dashboarduz` backend. This repo currently covers the **public landing
page**, the **tenant auth flow** (login + self-service registration, see below), a minimal **tenant
dashboard** (`/dashboard`, analytics summary only), the **platform admin auth flow**, and a minimal
**platform admin console** (`/platform/tenants/new` — create a tenant + its first admin user, now a
secondary/support path). Everything else (Users, Sales, Finance, CRM, Calls, the rest of Billing,
Notifications, full Analytics, Reports, the rest of the Platform Admin console) is a future phase — see
"Scope" below.

## Tech stack

- React 18 + TypeScript, Vite 8
- Tailwind CSS 4, CSS-first `@theme` config (no `tailwind.config.js`) — tokens live in `src/styles/theme.css`
- React Router 7 (`createBrowserRouter`, routes in `src/router.tsx`)
- A handful of vendored/adapted shadcn-style primitives in `src/components/ui/` (button, input, label, tabs,
  input-otp, sonner) built on the specific Radix primitives each one needs
- `qrcode.react` for rendering the Platform Admin 2FA `otpauth_uri` as a scannable QR code
- Plain `useState`-driven forms with manual validation — **not** `react-hook-form`/`zod`. Those were
  installed during initial planning but never wired in because hand-rolled state was sufficient for this
  scope; they were uninstalled again once confirmed unused. Don't reinstall them speculatively — add them
  when a dashboard-phase form actually needs schema validation complex enough to warrant it.

**Deliberately not installed**: `@mui/*`, `@emotion/*`, most Radix primitives beyond label/slot/tabs,
`recharts`, `react-day-picker`, `react-dnd*`, `embla-carousel*`, `react-slick`, `canvas-confetti`, `vaul`,
`cmdk`, `react-resizable-panels`, `react-responsive-masonry`, `next-themes`, `date-fns`, `@popperjs/core`,
`motion`. These came from the original Figma-Make design export but aren't used by anything in this repo.
Add each back only when a future dashboard page genuinely needs it — don't bulk-install them because an old
reference file mentions them.

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

`src/lib/api/client.ts` exposes a `newIdempotencyKey()` helper (`crypto.randomUUID()`) that no current
endpoint needs yet — it's there so the pattern already exists when a future dashboard phase adds
`POST /sales`, `POST /finance/payments`, etc., all of which require an `Idempotency-Key` header per
`FRONTEND.md`.

**Gotcha confirmed against the live backend**: platform access tokens carry **no `totp_enabled` claim**
(decoded a real one — only `sub`/`type`/`iat`/`exp` are present), unlike what `FRONTEND.md`'s general claims
note might suggest. `platformAuthStore.tsx`'s `totpEnabled` state is therefore tracked from *which auth step
succeeded* (login's `requires_2fa` flag, or a successful `confirm2fa()`/verify-login call), never by decoding
the token. Don't reintroduce JWT-claim decoding for this — it caused a real bug (infinite redirect loop
between `/platform/2fa-setup` and `/platform/welcome`, plus a StrictMode double-`/2fa/setup`-call side
effect) that was fixed by removing `src/lib/auth/jwt.ts` entirely.

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

**In scope now**:
- `/` landing page
- `/login/*` tenant auth (identifier + password, phone/OTP, forgot/reset), `/register/*` self-service tenant
  registration (identifier → code → company+password → trial-or-pay), `/dashboard` (tenant post-login page —
  `GET /api/v1/analytics/summary` only, today's period, no date-range picker; shows an explicit empty state
  for a tenant with no sales yet)
- `/platform/*` platform admin auth, `/platform/tenants/new` (secondary tenant-onboarding path, two-step
  wizard: `POST /platform/v1/tenants` then `POST /platform/v1/tenants/{id}/admin-user`)
- `src/lib/api/billing.ts` — scoped narrowly to what `/register/plan` needs (`GET /plans`,
  `POST /subscription`, `POST /payments/initiate`), not a full billing dashboard

**Future phases, not built yet**: a tenant-side 2FA setup page (needed to make `/register/plan`'s "pay now"
path actually completable — see the Self-service registration section above), Users, Roles/Permissions,
Catalog, Customers/CRM, Sales, Finance (payments/ledger/adjustment-requests/bonus-plans/payroll), Calls,
Attendance, the rest of Billing (usage/invoices/plan changes after signup), Notifications, the rest of
Analytics (leaderboard, course-sales, period filtering, SSE live updates), Live Leaderboard kiosk, external
CRM integrations, Reports, and the rest of the Platform Admin console (tenant list/billing/audit logs). The
routing structure, API client pattern, and folder layout (`src/pages/<feature>/`, `src/components/<shared>/`,
`src/lib/api/`, `src/lib/auth/`) are meant to extend cleanly into these — see
`FRONTEND.md` for the full API surface each one will need.
