import { apiFetch, newIdempotencyKey } from "./client";

export interface BillingPlan {
  id: string;
  code: string;
  name: string;
  price_amount: number;
  currency: string;
  billing_period_months: number;
  max_users: number;
  max_billable_storage_bytes: number;
  is_active: boolean;
}

export interface TenantSubscription {
  id: string;
  tenant_id: string;
  billing_plan_id: string;
  current_period_start: string;
  current_period_end: string;
}

export interface PaymentInitiateResult {
  payment_id: string;
  provider: string;
  checkout_url: string;
}

export function listPlans(accessToken: string) {
  return apiFetch<BillingPlan[]>("/api/v1/billing/plans", { accessToken });
}

// Tenant-self-service: picks the tenant's first plan (or changes it later).
// Not privileged/2FA-gated -- a just-registered admin has no 2FA set up yet.
// Doesn't move money by itself; see initiatePayment for the actual charge.
export function selectSubscription(accessToken: string, params: { billing_plan_code: string }) {
  return apiFetch<TenantSubscription>("/api/v1/billing/subscription", {
    method: "POST",
    accessToken,
    body: params,
  });
}

// Requires billing.manage (privileged -> 2FA must already be enabled on this
// account, per FRONTEND.md). Callers should catch a 403 here and route the
// user to 2FA setup first if they haven't enabled it yet.
export function initiatePayment(accessToken: string, params: { provider: "click" | "payme" }) {
  return apiFetch<PaymentInitiateResult>("/api/v1/billing/payments/initiate", {
    method: "POST",
    accessToken,
    body: params,
    idempotencyKey: newIdempotencyKey(),
  });
}
