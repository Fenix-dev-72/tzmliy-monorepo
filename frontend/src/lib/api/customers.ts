import { apiFetch, type Paginated } from "./client";

export type CustomerStage = "lead" | "qualified" | "customer" | "lost";

export interface Customer {
  id: string;
  tenant_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  company: string | null;
  address: string | null;
  responsible_user_id: string | null;
  stage: CustomerStage;
  created_at: string;
  updated_at: string;
}

export interface CustomerCreateInput {
  full_name: string;
  phone: string;
  email?: string;
  company?: string;
  address?: string;
  stage?: CustomerStage;
}

// 7 per page (2026-07-28, explicit request) -- numbered pagination like a
// movie/catalog site, not the old "load more" infinite-append pattern.
export const CUSTOMERS_PAGE_SIZE = 7;
// Uncapped fetch for non-paginated dropdown usage (e.g. Sales' customer
// picker) -- the backend's own max `limit` (200).
export const CUSTOMERS_DROPDOWN_LIMIT = 200;

export function listCustomers(accessToken: string, limit = CUSTOMERS_PAGE_SIZE, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return apiFetch<Paginated<Customer>>(`/api/v1/customers?${params.toString()}`, { accessToken });
}

export function createCustomer(accessToken: string, body: CustomerCreateInput) {
  return apiFetch<Customer>("/api/v1/customers", { method: "POST", accessToken, body });
}

export function getCustomerByPhone(accessToken: string, phone: string) {
  const params = new URLSearchParams({ phone });
  return apiFetch<Customer>(`/api/v1/customers/by-phone?${params.toString()}`, { accessToken });
}
