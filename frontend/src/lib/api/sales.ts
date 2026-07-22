import { apiFetch, newIdempotencyKey } from "./client";

export type SaleStatus = "active" | "completed" | "cancelled";
export type DeliveryMode = "online" | "offline" | "intensive";

export interface Sale {
  id: string;
  tenant_id: string;
  customer_id: string;
  catalog_category_id: string | null;
  responsible_user_id: string;
  currency: string;
  price_amount: number;
  deadline: string;
  delivery_mode: DeliveryMode | null;
  status: SaleStatus;
  version: number;
  product_id: string | null;
  quantity: number;
  created_at: string;
  updated_at: string;
}

export interface SaleCreateInput {
  customer_id: string;
  catalog_category_id?: string;
  responsible_user_id: string;
  currency: "UZS" | "USD";
  price_amount: number;
  deadline: string;
  delivery_mode?: DeliveryMode;
  product_id?: string;
  quantity?: number;
}

export const SALES_PAGE_SIZE = 50;

export function listSales(accessToken: string, limit = SALES_PAGE_SIZE, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return apiFetch<Sale[]>(`/api/v1/sales?${params.toString()}`, { accessToken });
}

export function createSale(accessToken: string, body: SaleCreateInput) {
  return apiFetch<Sale>("/api/v1/sales", {
    method: "POST",
    accessToken,
    body,
    idempotencyKey: newIdempotencyKey(),
  });
}
