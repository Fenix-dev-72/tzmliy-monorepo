import { apiFetch } from "./client";
import type { LoginResult, TenantUser, TokenPair } from "@/lib/auth/types";

export function login(params: { identifier: string; password: string }) {
  return apiFetch<LoginResult>("/api/v1/auth/login", { method: "POST", body: params });
}

export function verifyLogin2fa(params: { pending_token: string; code: string }) {
  return apiFetch<TokenPair>("/api/v1/auth/2fa/verify-login", { method: "POST", body: params });
}

export function resendLogin2fa(params: { pending_token: string }) {
  return apiFetch<{ resend_after_seconds: number }>("/api/v1/auth/2fa/resend-login-code", {
    method: "POST",
    body: params,
  });
}

export function refresh(params: { refresh_token: string }) {
  return apiFetch<TokenPair>("/api/v1/auth/refresh", { method: "POST", body: params });
}

export function logout(params: { refresh_token: string }) {
  return apiFetch<void>("/api/v1/auth/logout", { method: "POST", body: params });
}

export function requestOtp(params: { phone: string }) {
  return apiFetch<void>("/api/v1/auth/otp/request", { method: "POST", body: params });
}

export function verifyOtp(params: { phone: string; code: string }) {
  return apiFetch<TokenPair>("/api/v1/auth/otp/verify", { method: "POST", body: params });
}

export function requestPasswordReset(params: { identifier: string }) {
  return apiFetch<void>("/api/v1/auth/password-reset/request", { method: "POST", body: params });
}

export function confirmPasswordReset(params: {
  identifier: string;
  token: string;
  new_password: string;
}) {
  return apiFetch<void>("/api/v1/auth/password-reset/confirm", { method: "POST", body: params });
}

export function me(accessToken: string) {
  return apiFetch<TenantUser>("/api/v1/auth/me", { accessToken });
}

// --- Two-factor auth ---------------------------------------------------
// 2FA is email-OTP-based: setup/resend send a 6-digit code to the account's
// email, confirm verifies it. Enabling 2FA takes effect on the user's *next*
// token refresh (the totp_enabled claim is baked into the access token at
// issue time) -- callers must refresh the session right after confirm2fa
// succeeds, or privileged actions (finance.manage, etc.) will keep 403ing on
// the stale token.

export function setup2fa(accessToken: string) {
  return apiFetch<{ email_masked: string; resend_after_seconds: number }>("/api/v1/auth/2fa/setup", {
    method: "POST",
    accessToken,
  });
}

export function resendSetup2fa(accessToken: string) {
  return apiFetch<{ email_masked: string; resend_after_seconds: number }>("/api/v1/auth/2fa/resend-setup-code", {
    method: "POST",
    accessToken,
  });
}

export function confirm2fa(accessToken: string, code: string) {
  return apiFetch<void>("/api/v1/auth/2fa/confirm", { method: "POST", accessToken, body: { code } });
}

// Requires the current password as a re-auth guard -- a valid access token
// alone (e.g. an unattended open session) must not be enough to turn 2FA
// off. Same refresh-session caveat as confirm2fa: the totp_enabled claim is
// baked into the access token at issue time.
export function disable2fa(accessToken: string, password: string) {
  return apiFetch<void>("/api/v1/auth/2fa/disable", { method: "POST", accessToken, body: { password } });
}

// Revokes every refresh session (including the caller's own) on success --
// the current tab must log out right after this succeeds, since its own
// refresh token no longer works.
export function changePassword(accessToken: string, params: { current_password: string; new_password: string }) {
  return apiFetch<void>("/api/v1/auth/change-password", { method: "POST", accessToken, body: params });
}

// --- Self-service registration ---------------------------------------------
// identifier is an email or a phone number (E.164) -- the backend infers
// which by checking for "@". No tenant_slug anywhere in this flow.

export function registerRequestCode(params: { identifier: string }) {
  return apiFetch<void>("/api/v1/auth/register/request-code", { method: "POST", body: params });
}

export function registerVerifyCode(params: { identifier: string; code: string }) {
  return apiFetch<{ registration_token: string }>("/api/v1/auth/register/verify-code", {
    method: "POST",
    body: params,
  });
}

export function completeRegistration(params: {
  registration_token: string;
  company_name: string;
  slug: string;
  password: string;
}) {
  return apiFetch<TokenPair>("/api/v1/auth/register/complete", { method: "POST", body: params });
}

// --- Per-tenant subdomain login ({slug}.tizimly.uz) ---------------------
// Public, unauthenticated lookup -- backs the subdomain-branded login page.
// Throws ApiError(404) for an unknown/mistyped slug.

export function getTenantBySlug(slug: string) {
  return apiFetch<{ name: string; status: string }>(`/api/v1/tenants/by-slug/${encodeURIComponent(slug)}`);
}
