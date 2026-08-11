import { apiFetch } from "./client";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export interface TenantStatusCount {
  status: string;
  count: number;
}

export interface PaymentTotal {
  status: string;
  currency: string;
  count: number;
  total_amount: number;
}

export interface PlanUsage {
  code: string;
  name: string;
  is_active: boolean;
  tenant_count: number;
}

export interface PaymentKindTotal {
  kind: "new" | "recurring";
  currency: string;
  count: number;
  total_amount: number;
}

export interface DashboardSummary {
  total_tenants: number;
  tenants_by_status: TenantStatusCount[];
  new_tenants_7d: number;
  new_tenants_30d: number;
  payments_today: PaymentTotal[];
  payments_this_month: PaymentTotal[];
  payments_this_month_by_kind: PaymentKindTotal[];
  plans_usage: PlanUsage[];
}

export interface ServerMetrics {
  cpu_percent: number;
  memory_percent: number;
  memory_used_bytes: number;
  memory_total_bytes: number;
  disk_percent: number;
  disk_used_bytes: number;
  disk_total_bytes: number;
}

export interface TenantStorageUsage {
  tenant_id: string;
  tenant_name: string;
  plan_code: string | null;
  total_bytes: number;
  billable_storage_limit_bytes: number | null;
  usage_ratio_bps: number;
  computed_at: string | null;
}

export function getSummary(accessToken: string) {
  return apiFetch<DashboardSummary>("/platform/v1/dashboard/summary", { accessToken });
}

export function getStorageUsage(accessToken: string) {
  return apiFetch<TenantStorageUsage[]>("/platform/v1/dashboard/storage-usage", { accessToken });
}

export type SystemIssueSource = "notification" | "report_export" | "payroll" | "backup";

export interface SystemIssue {
  id: string;
  source: SystemIssueSource;
  tenant_id: string | null;
  tenant_name: string | null;
  title: string;
  detail: string | null;
  occurred_at: string | null;
}

export function getSystemIssues(accessToken: string) {
  return apiFetch<SystemIssue[]>("/platform/v1/dashboard/system-issues", { accessToken });
}

/**
 * Same hand-parsed SSE pattern as analytics.ts's subscribeLeaderboard --
 * `EventSource` can't send a custom Authorization header, so this uses a
 * plain authenticated `fetch` stream instead. Returns an unsubscribe function.
 */
export function subscribeServerMetrics(
  accessToken: string,
  onMetrics: (metrics: ServerMetrics) => void,
  onError?: () => void,
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${BASE_URL}/platform/v1/dashboard/server-metrics/stream`, {
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
            onMetrics(JSON.parse(line.slice(5).trim()) as ServerMetrics);
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
