import { apiFetch, newIdempotencyKey } from "./client";

export type PaymentMethod = "cash" | "card" | "click" | "payme" | "manual";
export type AdjustmentType = "refund" | "tariff_change";
export type AdjustmentStatus = "pending" | "approved" | "rejected";

export interface Payment {
  id: string;
  tenant_id: string;
  sale_id: string;
  amount: number;
  currency: string;
  method: string;
  idempotency_key: string;
  recorded_by_user_id: string;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  sale_id: string | null;
  customer_id: string | null;
  entry_type: "charge" | "payment" | "refund" | "adjustment";
  amount: number;
  currency: string;
  description: string | null;
  created_at: string;
}

export interface SaleLedger {
  entries: LedgerEntry[];
  balance: number;
}

export interface AdjustmentRequest {
  id: string;
  sale_id: string;
  requested_by_user_id: string;
  type: AdjustmentType;
  payload: Record<string, unknown>;
  status: AdjustmentStatus;
  reviewed_by_user_id: string | null;
  review_reason: string | null;
  version: number;
  created_at: string;
  reviewed_at: string | null;
}

export interface BonusPlan {
  id: string;
  name: string;
  applies_to_role_id: string;
  commission_bps: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
}

export interface PayrollEntry {
  id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  bonus_plan_id: string;
  base_amount: number;
  bonus_amount: number;
  currency: string;
  computed_at: string;
}

export function recordPayment(
  accessToken: string,
  body: { sale_id: string; amount: number; currency: "UZS" | "USD"; method: PaymentMethod },
) {
  return apiFetch<Payment>("/api/v1/finance/payments", {
    method: "POST",
    accessToken,
    body,
    idempotencyKey: newIdempotencyKey(),
  });
}

export function listPayments(accessToken: string, saleId: string) {
  return apiFetch<Payment[]>(`/api/v1/finance/payments/${saleId}`, { accessToken });
}

export function getSaleLedger(accessToken: string, saleId: string) {
  return apiFetch<SaleLedger>(`/api/v1/finance/payments/${saleId}/ledger`, { accessToken });
}

export function createAdjustmentRequest(
  accessToken: string,
  body: { sale_id: string; type: AdjustmentType; payload: Record<string, unknown> },
) {
  return apiFetch<AdjustmentRequest>("/api/v1/finance/adjustment-requests", {
    method: "POST",
    accessToken,
    body,
    idempotencyKey: newIdempotencyKey(),
  });
}

export function listAdjustmentRequests(accessToken: string, statusFilter?: AdjustmentStatus) {
  const query = statusFilter ? `?status_filter=${statusFilter}` : "";
  return apiFetch<AdjustmentRequest[]>(`/api/v1/finance/adjustment-requests${query}`, { accessToken });
}

export function approveAdjustmentRequest(
  accessToken: string,
  id: string,
  body: { version: number; review_reason?: string },
) {
  return apiFetch<AdjustmentRequest>(`/api/v1/finance/adjustment-requests/${id}/approve`, {
    method: "POST",
    accessToken,
    body,
    idempotencyKey: newIdempotencyKey(),
  });
}

export function rejectAdjustmentRequest(
  accessToken: string,
  id: string,
  body: { version: number; review_reason?: string },
) {
  return apiFetch<AdjustmentRequest>(`/api/v1/finance/adjustment-requests/${id}/reject`, {
    method: "POST",
    accessToken,
    body,
    idempotencyKey: newIdempotencyKey(),
  });
}

export function createBonusPlan(
  accessToken: string,
  body: {
    name: string;
    applies_to_role_id: string;
    commission_bps: number;
    effective_from: string;
    effective_to?: string;
  },
) {
  return apiFetch<BonusPlan>("/api/v1/finance/bonus-plans", {
    method: "POST",
    accessToken,
    body,
    idempotencyKey: newIdempotencyKey(),
  });
}

export function listBonusPlans(accessToken: string) {
  return apiFetch<BonusPlan[]>("/api/v1/finance/bonus-plans", { accessToken });
}

export function calculatePayroll(
  accessToken: string,
  body: { period_start: string; period_end: string; user_id?: string },
) {
  return apiFetch<PayrollEntry[]>("/api/v1/finance/payroll/calculate", { method: "POST", accessToken, body });
}

export function listPayrollEntries(accessToken: string, userId?: string) {
  const query = userId ? `?user_id=${userId}` : "";
  return apiFetch<PayrollEntry[]>(`/api/v1/finance/payroll${query}`, { accessToken });
}

// Minimal read, just for the bonus-plan role picker -- full roles
// management (create role, edit permissions) lands in Faza B's lib/api/roles.ts.
export function listRolesForSelect(accessToken: string) {
  return apiFetch<{ id: string; name: string }[]>("/api/v1/roles", { accessToken });
}
