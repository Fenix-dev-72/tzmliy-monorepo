import { apiFetch } from "./client";

export type CustomerStage = "lead" | "qualified" | "customer" | "lost";

export interface Customer {
  id: string;
  tenant_id: string;
  full_name: string;
  phone: string;
  responsible_user_id: string | null;
  stage: CustomerStage;
  created_at: string;
  updated_at: string;
}

export interface CustomerCreateInput {
  full_name: string;
  phone: string;
  stage?: CustomerStage;
}

export const CUSTOMERS_PAGE_SIZE = 50;

export function listCustomers(accessToken: string, limit = CUSTOMERS_PAGE_SIZE, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return apiFetch<Customer[]>(`/api/v1/customers?${params.toString()}`, { accessToken });
}

export function createCustomer(accessToken: string, body: CustomerCreateInput) {
  return apiFetch<Customer>("/api/v1/customers", { method: "POST", accessToken, body });
}

export function getCustomerByPhone(accessToken: string, phone: string) {
  const params = new URLSearchParams({ phone });
  return apiFetch<Customer>(`/api/v1/customers/by-phone?${params.toString()}`, { accessToken });
}
