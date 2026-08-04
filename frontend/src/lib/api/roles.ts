import { apiFetch, type Paginated } from "./client";

export interface Role {
  id: string;
  tenant_id: string;
  name: string;
  is_system: boolean;
  permissions: string[];
  created_at: string;
}

// 7 per page (2026-07-28) -- numbered pagination, not an unbounded list;
// real tenants have a handful of roles, but load-test/junk data can pile up
// thousands (the backend used to just hard-cap at 500 -- see roles.sql).
export const ROLES_PAGE_SIZE = 7;

export function listPermissions(accessToken: string) {
  return apiFetch<string[]>("/api/v1/permissions", { accessToken });
}

export function listRoles(accessToken: string, limit = ROLES_PAGE_SIZE, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return apiFetch<Paginated<Role>>(`/api/v1/roles?${params.toString()}`, { accessToken });
}

export function createRole(accessToken: string, body: { name: string; permissions: string[] }) {
  return apiFetch<Role>("/api/v1/roles", { method: "POST", accessToken, body });
}

export function updateRolePermissions(accessToken: string, roleId: string, permissions: string[]) {
  return apiFetch<Role>(`/api/v1/roles/${roleId}/permissions`, {
    method: "PATCH",
    accessToken,
    body: { permissions },
  });
}
