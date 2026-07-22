import { apiFetch } from "./client";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  trial_ends_at: string | null;
  created_at: string;
}

export interface TenantAdminUser {
  id: string;
  email: string;
  role_name: string;
}

export function createTenant(accessToken: string, params: { name: string; slug: string }) {
  return apiFetch<Tenant>("/platform/v1/tenants", { method: "POST", accessToken, body: params });
}

export function listTenants(accessToken: string) {
  return apiFetch<Tenant[]>("/platform/v1/tenants", { accessToken });
}

export function createTenantAdminUser(
  accessToken: string,
  tenantId: string,
  params: { email: string; password: string; reason: string },
) {
  return apiFetch<TenantAdminUser>(`/platform/v1/tenants/${tenantId}/admin-user`, {
    method: "POST",
    accessToken,
    body: params,
  });
}
