import { apiFetch, newIdempotencyKey } from "./client";

export type SaleStatus = "active" | "completed" | "cancelled";

export interface Sale {
  id: string;
  tenant_id: string;
  customer_id: string;
  catalog_category_id: string | null;
  responsible_user_id: string;
  currency: string;
  price_amount: number;
  deadline: string;
  status: SaleStatus;
  version: number;
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
}

export function listSales(accessToken: string) {
  return apiFetch<Sale[]>("/api/v1/sales", { accessToken });
}

export function createSale(accessToken: string, body: SaleCreateInput) {
  return apiFetch<Sale>("/api/v1/sales", {
    method: "POST",
    accessToken,
    body,
    idempotencyKey: newIdempotencyKey(),
  });
}
