import { apiFetch } from "./client";

export interface Role {
  id: string;
  tenant_id: string;
  name: string;
  is_system: boolean;
  permissions: string[];
  created_at: string;
}

export function listPermissions(accessToken: string) {
  return apiFetch<string[]>("/api/v1/permissions", { accessToken });
}

export function listRoles(accessToken: string) {
  return apiFetch<Role[]>("/api/v1/roles", { accessToken });
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
