import { apiFetch } from "./client";

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

export function configureAmoCrm(
  accessToken: string,
  body: { subdomain: string; api_token: string; webhook_secret: string },
) {
  return apiFetch<CrmIntegration>("/api/v1/crm/integrations/amocrm", { method: "POST", accessToken, body });
}

export function configureBitrix24(accessToken: string, body: { webhook_base_url: string; application_token: string }) {
  return apiFetch<CrmIntegration>("/api/v1/crm/integrations/bitrix24", { method: "POST", accessToken, body });
}

export function configureMetaAds(accessToken: string, body: { ad_account_id: string; access_token: string }) {
  return apiFetch<CrmIntegration>("/api/v1/crm/integrations/meta-ads", { method: "POST", accessToken, body });
}

export function listLeads(accessToken: string) {
  return apiFetch<CrmLeadSync[]>("/api/v1/crm/leads", { accessToken });
}

export function listAdCampaigns(accessToken: string) {
  return apiFetch<AdCampaign[]>("/api/v1/crm/ad-campaigns", { accessToken });
}

export function listAdInsights(accessToken: string, campaignId?: string) {
  const query = campaignId ? `?campaign_id=${campaignId}` : "";
  return apiFetch<AdInsight[]>(`/api/v1/crm/ad-insights${query}`, { accessToken });
}
