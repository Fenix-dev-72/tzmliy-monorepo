const BASE_URL = import.meta.env.VITE_API_BASE_URL;

// This file predates lib/api/client.ts's apiFetch and still does its own raw
// fetch() calls -- same timeout gap fixed there (2026-07-15): without an
// AbortController, a hung backend/export job left these promises never
// resolving, so callers' loading state stuck forever.
const REQUEST_TIMEOUT_MS = 20_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("So'rov vaqti tugadi -- internet aloqasini tekshiring");
    }
    throw new Error("Serverga ulanib bo'lmadi");
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface SaleWithoutChargeEntry {
  sale_id: string;
  customer_id: string;
  price_amount: number;
  currency: string;
  created_at: string;
}

export interface StalePendingAdjustmentRequest {
  id: string;
  sale_id: string;
  type: string;
  created_at: string;
  age_days: number;
}

export interface NegativeBalanceSale {
  sale_id: string;
  currency: string;
  balance: number;
}

export interface WebhookEventsBacklogEntry {
  provider: string;
  unprocessed_count: number;
  oldest_created_at: string | null;
}

export interface NotificationOutboxBacklogEntry {
  status: string;
  count: number;
  oldest_created_at: string | null;
}

export interface Diagnostics {
  generated_at: string;
  sales_without_charge_entry: SaleWithoutChargeEntry[];
  stale_pending_adjustment_requests: StalePendingAdjustmentRequest[];
  negative_balance_sales: NegativeBalanceSale[];
  webhook_events_backlog: WebhookEventsBacklogEntry[];
  notification_outbox_backlog: NotificationOutboxBacklogEntry[];
}

export async function getDiagnostics(accessToken: string): Promise<Diagnostics> {
  const res = await fetchWithTimeout(`${BASE_URL}/api/v1/reports/diagnostics`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
  return res.json();
}

export type ExportEntity = "customers" | "sales" | "finance" | "calls";
export type ExportFormat = "csv" | "xlsx";
export type ExportJobStatus = "pending" | "processing" | "done" | "failed";

export interface ExportJob {
  id: string;
  entity: string;
  format: string;
  status: ExportJobStatus;
  error: string | null;
  download_url: string | null;
}

export async function requestExport(accessToken: string, entity: ExportEntity, format: ExportFormat): Promise<ExportJob> {
  const res = await fetchWithTimeout(`${BASE_URL}/api/v1/reports/export/${entity}?format=${format}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
  return res.json();
}

export async function getExportJobStatus(accessToken: string, jobId: string): Promise<ExportJob> {
  const res = await fetchWithTimeout(`${BASE_URL}/api/v1/reports/export/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
  return res.json();
}

// Enqueues the export, polls until the background worker finishes it, then
// triggers the browser download from the presigned URL (no auth header
// needed there -- the URL itself is already signed).
//
// MAX_POLL_ATTEMPTS caps the wait at 90s (2026-07-15) -- without it, a job
// that never reaches "done"/"failed" (e.g. object storage misconfigured
// server-side, so the worker never flips the status either way) polled
// forever, leaving the "Export" button's spinner stuck indefinitely with no
// visible error -- the exact "stuck loading" complaint, just on this page.
const MAX_POLL_ATTEMPTS = 60;

export async function exportEntity(accessToken: string, entity: ExportEntity, format: ExportFormat): Promise<void> {
  let job = await requestExport(accessToken, entity, format);
  let attempts = 0;
  while (job.status === "pending" || job.status === "processing") {
    if (++attempts > MAX_POLL_ATTEMPTS) {
      throw new Error("Eksport juda uzoq davom etmoqda -- keyinroq qayta urinib ko'ring");
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
    job = await getExportJobStatus(accessToken, job.id);
  }
  if (job.status === "failed" || !job.download_url) {
    throw new Error(job.error || "Export failed");
  }
  const a = document.createElement("a");
  a.href = job.download_url;
  a.download = `${entity}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
