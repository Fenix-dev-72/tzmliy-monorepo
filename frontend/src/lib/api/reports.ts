const BASE_URL = import.meta.env.VITE_API_BASE_URL;

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
  const res = await fetch(`${BASE_URL}/api/v1/reports/diagnostics`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
  return res.json();
}

export type ExportEntity = "customers" | "sales" | "finance" | "calls";
export type ExportFormat = "csv" | "xlsx";

export async function exportEntity(accessToken: string, entity: ExportEntity, format: ExportFormat): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/v1/reports/export/${entity}?format=${format}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${entity}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
