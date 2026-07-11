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

export function listCalls(accessToken: string, responsibleUserId?: string) {
  const query = responsibleUserId ? `?responsible_user_id=${responsibleUserId}` : "";
  return apiFetch<Call[]>(`/api/v1/calls/calls${query}`, { accessToken });
}

export function getRecordingUrl(accessToken: string, callId: string) {
  return apiFetch<{ url: string }>(`/api/v1/calls/calls/${callId}/recording`, { accessToken });
}

export function createIntegration(
  accessToken: string,
  body: { provider: "utel" | "moi_zvonki"; webhook_secret: string; api_key?: string },
) {
  return apiFetch<IntegrationCredential>("/api/v1/calls/integrations", { method: "POST", accessToken, body });
}

export function listIntegrations(accessToken: string) {
  return apiFetch<IntegrationCredential[]>("/api/v1/calls/integrations", { accessToken });
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
