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

export function listCustomers(accessToken: string) {
  return apiFetch<Customer[]>("/api/v1/customers", { accessToken });
}

export function createCustomer(accessToken: string, body: CustomerCreateInput) {
  return apiFetch<Customer>("/api/v1/customers", { method: "POST", accessToken, body });
}
