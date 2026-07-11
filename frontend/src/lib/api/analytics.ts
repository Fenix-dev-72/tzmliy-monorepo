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
