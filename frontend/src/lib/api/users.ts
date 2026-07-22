import { apiFetch } from "./client";

export interface TenantUserRow {
  id: string;
  tenant_id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
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

export const USERS_PAGE_SIZE = 20;

// Callers that need every user for a lookup/dropdown (not the paginated
// Users management page itself) should pass USERS_DROPDOWN_LIMIT explicitly
// -- same convention as sales.ts's CUSTOMER_DROPDOWN_LIMIT.
export const USERS_DROPDOWN_LIMIT = 200;

export function listUsers(accessToken: string, limit = USERS_PAGE_SIZE, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return apiFetch<TenantUserRow[]>(`/api/v1/users?${params.toString()}`, { accessToken });
}

export function updateUserRole(accessToken: string, userId: string, roleId: string) {
  return apiFetch<void>(`/api/v1/users/${userId}/role`, { method: "PATCH", accessToken, body: { role_id: roleId } });
}

export function deactivateUser(accessToken: string, userId: string) {
  return apiFetch<void>(`/api/v1/users/${userId}/deactivate`, { method: "PATCH", accessToken });
}

export interface ProfileUpdate {
  full_name?: string | null;
  phone?: string | null;
}

export function updateOwnProfile(accessToken: string, body: ProfileUpdate) {
  return apiFetch<TenantUserRow>("/api/v1/users/me/profile", { method: "PATCH", accessToken, body });
}

export function updateUserProfile(accessToken: string, userId: string, body: ProfileUpdate) {
  return apiFetch<TenantUserRow>(`/api/v1/users/${userId}/profile`, { method: "PATCH", accessToken, body });
}
