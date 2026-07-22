import { apiFetch } from "./client";

export interface CategoryNode {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
  children: CategoryNode[];
}

export function listCategories(accessToken: string) {
  return apiFetch<CategoryNode[]>("/api/v1/catalog/categories", { accessToken });
}

export function createCategory(accessToken: string, body: { name: string; parent_id?: string }) {
  return apiFetch<CategoryNode>("/api/v1/catalog/categories", { method: "POST", accessToken, body });
}

export function updateCategory(accessToken: string, id: string, body: { name: string }) {
  return apiFetch<CategoryNode>(`/api/v1/catalog/categories/${id}`, { method: "PATCH", accessToken, body });
}

export function deleteCategory(accessToken: string, id: string) {
  return apiFetch<void>(`/api/v1/catalog/categories/${id}`, { method: "DELETE", accessToken });
}

export function flattenCategories(nodes: CategoryNode[], depth = 0): { id: string; label: string }[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${"— ".repeat(depth)}${node.name}` },
    ...flattenCategories(node.children, depth + 1),
  ]);
}
