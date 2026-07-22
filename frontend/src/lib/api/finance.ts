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
  reversed_at: string | null;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  sale_id: string | null;
  customer_id: string | null;
  entry_type: "charge" | "payment" | "refund" | "adjustment";
  amount: number;
  currency: string;
  related_payment_id: string | null;
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

export type BonusType = "percent" | "fixed_per_sale";

export interface BonusPlan {
  id: string;
  name: string;
  applies_to_role_id: string;
  bonus_type: BonusType;
  commission_bps: number;
  fixed_amount: number | null;
  fixed_amount_currency: string | null;
  catalog_category_id: string | null;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
}

export interface PayrollEntry {
  id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  bonus_plan_id: string | null;
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

// One-click undo for a mistakenly-entered payment (2026-07-16) -- posts a
// compensating ledger entry server-side, restoring the balance.
export function reversePayment(accessToken: string, paymentId: string) {
  return apiFetch<LedgerEntry>(`/api/v1/finance/payments/${paymentId}/reverse`, { method: "POST", accessToken });
}

export function getSaleLedger(accessToken: string, saleId: string) {
  return apiFetch<SaleLedger>(`/api/v1/finance/payments/${saleId}/ledger`, { accessToken });
}

export interface CustomerOutstandingSale {
  sale_id: string;
  catalog_category_id: string | null;
  category_name: string | null;
  price_amount: number;
  currency: string;
  deadline: string;
  status: string;
  balance: number;
}

export function getCustomerOutstandingSales(accessToken: string, customerId: string) {
  return apiFetch<CustomerOutstandingSale[]>(`/api/v1/finance/customers/${customerId}/outstanding`, { accessToken });
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
    bonus_type: BonusType;
    commission_bps?: number;
    fixed_amount?: number | null;
    fixed_amount_currency?: string | null;
    catalog_category_id?: string | null;
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

export const BONUS_PLANS_PAGE_SIZE = 50;

export function listBonusPlans(accessToken: string, limit = BONUS_PLANS_PAGE_SIZE, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return apiFetch<BonusPlan[]>(`/api/v1/finance/bonus-plans?${params.toString()}`, { accessToken });
}

export type PayrollJobStatus = "pending" | "processing" | "done" | "failed";

export interface PayrollJob {
  id: string;
  period_start: string;
  period_end: string;
  user_id: string | null;
  status: PayrollJobStatus;
  error: string | null;
  created_at: string;
}

export function calculatePayroll(
  accessToken: string,
  body: { period_start: string; period_end: string; user_id?: string },
) {
  // Enqueues a background job (202 Accepted) instead of computing
  // synchronously -- poll getPayrollJobStatus until status is done/failed.
  return apiFetch<PayrollJob>("/api/v1/finance/payroll/calculate", { method: "POST", accessToken, body });
}

export function getPayrollJobStatus(accessToken: string, jobId: string) {
  return apiFetch<PayrollJob>(`/api/v1/finance/payroll/jobs/${jobId}`, { accessToken });
}

export const PAYROLL_ENTRIES_PAGE_SIZE = 50;

export function listPayrollEntries(accessToken: string, userId?: string, limit = PAYROLL_ENTRIES_PAGE_SIZE, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (userId) params.set("user_id", userId);
  return apiFetch<PayrollEntry[]>(`/api/v1/finance/payroll?${params.toString()}`, { accessToken });
}

export interface ProfitSummaryEntry {
  currency: string;
  revenue: number;
  cost: number;
  profit: number;
}

export function getProfitSummary(accessToken: string, periodStart: string, periodEnd: string) {
  const params = new URLSearchParams({ period_start: periodStart, period_end: periodEnd });
  return apiFetch<ProfitSummaryEntry[]>(`/api/v1/finance/profit-summary?${params.toString()}`, { accessToken });
}

// Minimal read, just for the bonus-plan role picker -- full roles
// management (create role, edit permissions) lands in Faza B's lib/api/roles.ts.
export function listRolesForSelect(accessToken: string) {
  return apiFetch<{ id: string; name: string }[]>("/api/v1/roles", { accessToken });
}
