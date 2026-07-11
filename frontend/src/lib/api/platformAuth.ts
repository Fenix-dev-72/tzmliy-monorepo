import { apiFetch } from "./client";
import type { LoginResult, TokenPair } from "@/lib/auth/types";

export function login(params: { email: string; password: string }) {
  return apiFetch<LoginResult>("/platform/v1/auth/login", { method: "POST", body: params });
}

export function verifyLogin2fa(params: { pending_token: string; code: string }) {
  return apiFetch<TokenPair>("/platform/v1/auth/2fa/verify-login", { method: "POST", body: params });
}

export function refresh(params: { refresh_token: string }) {
  return apiFetch<TokenPair>("/platform/v1/auth/refresh", { method: "POST", body: params });
}

export function logout(params: { refresh_token: string }) {
  return apiFetch<void>("/platform/v1/auth/logout", { method: "POST", body: params });
}

export function setup2fa(accessToken: string) {
  return apiFetch<{ secret: string; otpauth_uri: string }>("/platform/v1/auth/2fa/setup", {
    method: "POST",
    accessToken,
  });
}

export function confirm2fa(accessToken: string, params: { code: string }) {
  return apiFetch<void>("/platform/v1/auth/2fa/confirm", {
    method: "POST",
    accessToken,
    body: params,
  });
}
