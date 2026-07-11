import { apiFetch } from "./client";

export interface TenantUserRow {
  id: string;
  tenant_id: string;
  email: string | null;
  phone: string | null;
  role_id: string;
  role_name: string;
  is_active: boolean;
  created_at: string;
}

export function createUser(
  accessToken: string,
  body: { email: string; password: string; role_id: string; phone?: string },
) {
  return apiFetch<TenantUserRow>("/api/v1/users", { method: "POST", accessToken, body });
}

export function listUsers(accessToken: string) {
  return apiFetch<TenantUserRow[]>("/api/v1/users", { accessToken });
}

export function updateUserRole(accessToken: string, userId: string, roleId: string) {
  return apiFetch<void>(`/api/v1/users/${userId}/role`, { method: "PATCH", accessToken, body: { role_id: roleId } });
}

export function deactivateUser(accessToken: string, userId: string) {
  return apiFetch<void>(`/api/v1/users/${userId}/deactivate`, { method: "PATCH", accessToken });
}
