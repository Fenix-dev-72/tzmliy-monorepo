import { apiFetch } from "./client";

export interface Call {
  id: string;
  tenant_id: string;
  provider: string;
  external_call_id: string;
  direction: "inbound" | "outbound";
  from_number: string;
  to_number: string;
  responsible_user_id: string | null;
  duration_seconds: number;
  recording_object_key: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface IntegrationCredential {
  id: string;
  tenant_id: string;
  provider: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ManagerMapping {
  id: string;
  tenant_id: string;
  provider: string;
  external_agent_id: string;
  user_id: string;
  is_active: boolean;
  created_at: string;
}

export const CALLS_PAGE_SIZE = 50;

export function listCalls(accessToken: string, responsibleUserId?: string, limit = CALLS_PAGE_SIZE, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (responsibleUserId) params.set("responsible_user_id", responsibleUserId);
  return apiFetch<Call[]>(`/api/v1/calls/calls?${params.toString()}`, { accessToken });
}

export function getRecordingUrl(accessToken: string, callId: string) {
  return apiFetch<{ url: string }>(`/api/v1/calls/calls/${callId}/recording`, { accessToken });
}

export function listIntegrations(accessToken: string) {
  return apiFetch<IntegrationCredential[]>("/api/v1/calls/integrations", { accessToken });
}

// Soft-disconnect (2026-07-17) -- deactivates the stored credential without
// deleting it, so a later reconnect can still reuse the same webhook secret.
export function disconnectIntegration(accessToken: string, provider: "utel" | "moi_zvonki") {
  return apiFetch<void>(`/api/v1/calls/integrations/${provider}`, { method: "DELETE", accessToken });
}

// Real "1 tugma bilan ulash" for UTEL (2026-07-17, confirmed against UTEL's
// live OpenAPI spec at api.dev.utel.uz/docs/api) -- unlike
// quickConnectIntegration above, this actually logs into UTEL with the
// tenant's own email+password and registers Tizimly's webhook URL through
// UTEL's own API, so the admin never has to open UTEL's dashboard at all.
// Credentials are sent once and never stored on our side.
export function connectUtel(accessToken: string, body: { subdomain: string; email: string; password: string }) {
  return apiFetch<IntegrationCredential>("/api/v1/calls/integrations/utel/connect", {
    method: "POST",
    accessToken,
    body,
  });
}

// Real "1 tugma bilan ulash" for "Мои звонки" (2026-07-17, confirmed against
// its live API docs at moizvonki.ru/guide/api) -- unlike UTEL, this provider
// has no login step: it registers Tizimly's webhook URL using the tenant's
// own account email (user_name) + a pre-existing api_key they copy from
// their own account settings (Настройки -> Интеграция).
export function connectMoiZvonki(accessToken: string, body: { domain: string; user_name: string; api_key: string }) {
  return apiFetch<IntegrationCredential>("/api/v1/calls/integrations/moi-zvonki/connect", {
    method: "POST",
    accessToken,
    body,
  });
}

// Gated by calls.view (not calls.manage) server-side -- same "both admin
// and ordinary employees can retrieve it, no DB access needed" convention as
// crm.ts's getWebhookUrl. Shown mainly for informational/debugging purposes
// -- the secret is already embedded in webhook_url itself.
export function getWebhookInfo(accessToken: string, provider: "utel" | "moi_zvonki") {
  return apiFetch<{ webhook_url: string; webhook_secret: string }>(
    `/api/v1/calls/integrations/${provider}/webhook-url`,
    { accessToken },
  );
}

export function createManagerMapping(
  accessToken: string,
  body: { provider: "utel" | "moi_zvonki"; external_agent_id: string; user_id: string },
) {
  return apiFetch<ManagerMapping>("/api/v1/calls/manager-mappings", { method: "POST", accessToken, body });
}

export function listManagerMappings(accessToken: string) {
  return apiFetch<ManagerMapping[]>("/api/v1/calls/manager-mappings", { accessToken });
}

// Self-service: no calls.manage needed -- an employee links their own UTEL
// agent id on first login (client requirement, 2026-07-11), user_id is
// always the caller's own token, never a request field.
export function createOwnManagerMapping(accessToken: string, body: { provider: "utel" | "moi_zvonki"; external_agent_id: string }) {
  return apiFetch<ManagerMapping>("/api/v1/calls/manager-mappings/me", { method: "POST", accessToken, body });
}
