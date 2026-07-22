import { apiFetch } from "./client";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export interface CurrencyTotal {
  currency: string;
  total_amount: number;
}

export interface LeaderboardEntry {
  user_id: string;
  user_email: string;
  currency: string;
  sales_count: number;
  total_amount: number;
}

export interface DashboardSummary {
  period_start: string;
  period_end: string;
  total_sales_count: number;
  sales_by_currency: CurrencyTotal[];
  collected_by_currency: CurrencyTotal[];
  active_customers_count: number;
  top_sellers: LeaderboardEntry[];
}

export function getSummary(accessToken: string) {
  return apiFetch<DashboardSummary>("/api/v1/analytics/summary", { accessToken });
}

export function getLeaderboard(accessToken: string) {
  return apiFetch<LeaderboardEntry[]>("/api/v1/analytics/leaderboard", { accessToken });
}

export interface CategorySalesEntry {
  category_id: string | null;
  category_name: string | null;
  currency: string;
  sales_count: number;
  total_amount: number;
}

export function getCourseSales(accessToken: string, periodStart?: string, periodEnd?: string) {
  const params = new URLSearchParams();
  if (periodStart) params.set("period_start", periodStart);
  if (periodEnd) params.set("period_end", periodEnd);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<CategorySalesEntry[]>(`/api/v1/analytics/course-sales${query}`, { accessToken });
}

export interface SellerSalesByMode {
  mode: "online" | "offline" | "intensive" | null;
  currency: string;
  sales_count: number;
  agreed_amount: number;
  collected_amount: number;
}

export interface SellerKpis {
  period_start: string;
  period_end: string;
  leads_count: number;
  sales_count: number;
  conversion_pct: number | null;
  sales_total_uzs: number;
  sales_total_usd: number;
  debt_collection_pct: number | null;
  refund_pct: number | null;
  // null when the seller hasn't linked their CRM identity yet, or the live
  // AmoCRM/Bitrix24 call failed -- render as a placeholder, not an error.
  followup_pct: number | null;
  followup_total: number | null;
  followup_linked: boolean;
  sales_by_mode: SellerSalesByMode[];
  calls_total: number;
  calls_outbound: number;
  calls_inbound: number;
  calls_missed_pct: number | null;
  calls_avg_duration_seconds: number | null;
  calls_daily_talk_seconds: number | null;
  crm_notes_count: number;
  crm_stage_changes_count: number;
  leads_active_count: number;
  leads_won_count: number;
  leads_lost_count: number;
  // 2026-07-15 (seller/lead analytics): only ever set once a lead reaches a
  // terminal CRM outcome.
  leads_quality_count: number;
  leads_low_quality_count: number;
  lead_response_median_seconds: number | null;
}

// One combined request per period change -- backend runs 9 internal
// aggregate queries (in parallel) + one external CRM call server-side, so
// the frontend never needs more than this single call per tile refresh.
export function getSellerKpis(accessToken: string, userId: string, periodStart: string, periodEnd: string) {
  const params = new URLSearchParams({ period_start: periodStart, period_end: periodEnd });
  return apiFetch<SellerKpis>(`/api/v1/analytics/sellers/${userId}/kpis?${params.toString()}`, { accessToken });
}

export type RevenuePeriod = "day" | "week" | "month";

export interface RevenueBucket {
  bucket_start: string;
  currency: string;
  sales_amount: number;
  collected_amount: number;
}

export function getRevenueTimeseries(accessToken: string, period: RevenuePeriod) {
  return apiFetch<RevenueBucket[]>(`/api/v1/analytics/revenue-timeseries?period=${period}`, { accessToken });
}

export interface DebtSummaryEntry {
  currency: string;
  total_outstanding: number;
  overdue_amount: number;
  overdue_count: number;
}

export function getDebtSummary(accessToken: string) {
  return apiFetch<DebtSummaryEntry[]>("/api/v1/analytics/debt-summary", { accessToken });
}

// Tenant-wide counterpart to SellerKpis' lead-funnel section (2026-07-15,
// "umumiy ishlarni adminga ko'rsatish kerak") -- summed across every
// seller, shown on the main dashboard rather than the per-seller KPI modal.
export interface LeadQualitySummary {
  period_start: string;
  period_end: string;
  received_count: number;
  active_count: number;
  won_count: number;
  lost_count: number;
  quality_count: number;
  low_quality_count: number;
  conversion_pct: number | null;
}

export function getLeadQualitySummary(accessToken: string, periodStart?: string, periodEnd?: string) {
  const params = new URLSearchParams();
  if (periodStart) params.set("period_start", periodStart);
  if (periodEnd) params.set("period_end", periodEnd);
  const query = params.toString();
  return apiFetch<LeadQualitySummary>(`/api/v1/analytics/lead-quality-summary${query ? `?${query}` : ""}`, { accessToken });
}

export interface KioskDashboard {
  id: string;
  tenant_id: string;
  name: string;
  created_at: string;
}

export function createDashboard(accessToken: string, body: { name: string; password: string }) {
  return apiFetch<KioskDashboard>("/api/v1/analytics/dashboards", { method: "POST", accessToken, body });
}

export function listDashboards(accessToken: string) {
  return apiFetch<KioskDashboard[]>("/api/v1/analytics/dashboards", { accessToken });
}

export function deleteDashboard(accessToken: string, id: string) {
  return apiFetch<void>(`/api/v1/analytics/dashboards/${id}`, { method: "DELETE", accessToken });
}

/**
 * `EventSource` can't send a custom `Authorization` header, and this stream
 * is gated by the same Bearer-token auth as every other endpoint -- so the
 * SSE frames are parsed by hand off a plain authenticated `fetch` stream
 * instead. Returns an unsubscribe function; `onEntries` fires on every
 * `data:` frame the backend pushes (one per `analytics_sse_poll_seconds`).
 */
export function subscribeLeaderboard(
  accessToken: string,
  onEntries: (entries: LeaderboardEntry[]) => void,
  onError?: () => void,
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/v1/analytics/leaderboard/stream`, {
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
            onEntries(JSON.parse(line.slice(5).trim()) as LeaderboardEntry[]);
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
