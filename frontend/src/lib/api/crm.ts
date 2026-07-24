import { apiFetch } from "./client";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export interface CrmIntegration {
  id: string;
  tenant_id: string;
  provider: string;
  external_account_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CrmLeadSync {
  id: string;
  tenant_id: string;
  customer_id: string;
  provider: string;
  external_lead_id: string | null;
  direction: "inbound" | "outbound";
  raw_payload: Record<string, unknown> | null;
  synced_at: string;
}

export interface AdCampaign {
  id: string;
  tenant_id: string;
  provider: string;
  external_campaign_id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AdInsight {
  id: string;
  tenant_id: string;
  campaign_id: string;
  insight_date: string;
  impressions: number;
  clicks: number;
  spend_amount: number;
  currency: string;
  created_at: string;
}

export function configureMetaAds(accessToken: string, body: { ad_account_id: string; access_token: string }) {
  return apiFetch<CrmIntegration>("/api/v1/crm/integrations/meta-ads", { method: "POST", accessToken, body });
}

export type OAuthProvider = "amocrm" | "bitrix24" | "meta_ads";

// Returns the URL as JSON rather than redirecting -- this is an
// authenticated bearer-token call and a plain browser navigation can't
// carry that header. The caller does window.location.assign(authorize_url)
// itself once it has the URL.
export function getOAuthAuthorizeUrl(accessToken: string, provider: OAuthProvider, domain?: string) {
  const query = domain ? `?domain=${encodeURIComponent(domain)}` : "";
  return apiFetch<{ authorize_url: string }>(`/api/v1/crm/oauth/${provider}/authorize-url${query}`, { accessToken });
}

// Lets IntegrationsPage know which providers are already connected on a
// fresh page load, not just right after a same-session configure/connect --
// without this, a real successful connection still showed as "not
// connected" after any reload (found 2026-07-15).
export function listIntegrations(accessToken: string) {
  return apiFetch<CrmIntegration[]>("/api/v1/crm/integrations", { accessToken });
}

// Soft-disconnect (2026-07-17) -- deactivates the stored credential without
// deleting it, so a later reconnect can still reuse whatever the row
// already has.
export function disconnectIntegration(accessToken: string, provider: OAuthProvider) {
  return apiFetch<void>(`/api/v1/crm/integrations/${provider}`, { method: "DELETE", accessToken });
}

export function listLeads(accessToken: string) {
  return apiFetch<CrmLeadSync[]>("/api/v1/crm/leads", { accessToken });
}

/**
 * Same hand-rolled SSE parsing as analytics.ts's subscribeLeaderboard (see
 * its comment for why -- EventSource can't carry a Bearer header). Added
 * 2026-07-17: IntegrationsPage's "Lidlar tarixi" table used to only fetch
 * once on mount, so a lead pushed in by a webhook seconds later stayed
 * invisible until a manual reload -- this makes it appear live, same as the
 * leaderboard already does. Returns an unsubscribe function; onLeads fires
 * on every `data:` frame (one per backend poll tick).
 */
export function subscribeLeads(
  accessToken: string,
  onLeads: (leads: CrmLeadSync[]) => void,
  onError?: () => void,
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/v1/crm/leads/stream`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error("stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try {
            onLeads(JSON.parse(line.slice(5).trim()) as CrmLeadSync[]);
          } catch {
            // malformed frame -- skip it, the next tick will self-correct
          }
        }
      }
    } catch {
      if (!controller.signal.aborted) onError?.();
    }
  })();

  return () => controller.abort();
}

export function listAdCampaigns(accessToken: string) {
  return apiFetch<AdCampaign[]>("/api/v1/crm/ad-campaigns", { accessToken });
}

export function listAdInsights(accessToken: string, campaignId?: string) {
  const query = campaignId ? `?campaign_id=${campaignId}` : "";
  return apiFetch<AdInsight[]>(`/api/v1/crm/ad-insights${query}`, { accessToken });
}

export interface CrmManagerMapping {
  id: string;
  tenant_id: string;
  provider: string;
  external_manager_id: string;
  user_id: string;
  is_active: boolean;
  created_at: string;
}

// Self-service: no crm.manage needed -- an employee links their own CRM
// manager identity on first login (client requirement, 2026-07-11), user_id
// is always the caller's own token, never a request field.
export function createOwnManagerMapping(accessToken: string, body: { provider: "amocrm" | "bitrix24"; external_manager_id: string }) {
  return apiFetch<CrmManagerMapping>("/api/v1/crm/manager-mappings/me", { method: "POST", accessToken, body });
}

export interface ManagerCandidate {
  external_manager_id: string;
  name: string;
}

// Lets CompleteSetupPage show a real name dropdown instead of asking the
// employee to type a raw external CRM user id by hand (2026-07-15) -- []
// (not an error) when the tenant hasn't connected that provider yet.
export function listManagerCandidates(accessToken: string, provider: "amocrm" | "bitrix24") {
  return apiFetch<ManagerCandidate[]>(`/api/v1/crm/manager-candidates?provider=${provider}`, { accessToken });
}
