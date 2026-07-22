import { apiFetch, apiFetchForm } from "./client";

export interface Product {
  id: string;
  tenant_id: string;
  category_id: string;
  name: string;
  cost_price_amount: number;
  cost_price_currency: "UZS" | "USD";
  sell_price_amount: number;
  sell_price_currency: "UZS" | "USD";
  stock_quantity: number;
  photo_object_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductCreateInput {
  name: string;
  category_id: string;
  cost_price_amount: number;
  cost_price_currency: "UZS" | "USD";
  sell_price_amount: number;
  sell_price_currency: "UZS" | "USD";
  stock_quantity: number;
}

export type ProductUpdateInput = Omit<ProductCreateInput, "stock_quantity">;

export function listProducts(accessToken: string, categoryId?: string) {
  const query = categoryId ? `?category_id=${categoryId}` : "";
  return apiFetch<Product[]>(`/api/v1/products${query}`, { accessToken });
}

export function createProduct(accessToken: string, body: ProductCreateInput) {
  return apiFetch<Product>("/api/v1/products", { method: "POST", accessToken, body });
}

export function updateProduct(accessToken: string, id: string, body: ProductUpdateInput) {
  return apiFetch<Product>(`/api/v1/products/${id}`, { method: "PATCH", accessToken, body });
}

export function deleteProduct(accessToken: string, id: string) {
  return apiFetch<void>(`/api/v1/products/${id}`, { method: "DELETE", accessToken });
}

export function adjustStock(accessToken: string, id: string, delta: number) {
  return apiFetch<Product>(`/api/v1/products/${id}/stock-adjust`, { method: "POST", accessToken, body: { delta } });
}

export function uploadProductPhoto(accessToken: string, id: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiFetchForm<void>(`/api/v1/products/${id}/photo`, { accessToken, form });
}

export function getProductPhotoUrl(accessToken: string, id: string) {
  return apiFetch<{ photo_url: string }>(`/api/v1/products/${id}/photo-url`, { accessToken });
}
