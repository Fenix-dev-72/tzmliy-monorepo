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
  features_uz: string[];
  features_ru: string[];
  feature_keys: string[];
  is_popular: boolean;
  is_active: boolean;
  is_trial: boolean;
  trial_days: number | null;
  created_at: string;
  updated_at: string;
}

export interface BillingPlanPublic {
  code: string;
  name: string;
  price_amount: number;
  currency: string;
  billing_period_months: number;
  max_users: number;
  features_uz: string[];
  features_ru: string[];
  is_popular: boolean;
  is_trial: boolean;
  trial_days: number | null;
}

export interface BillingPlanCreateParams {
  code: string;
  name: string;
  price_amount: number;
  currency: string;
  billing_period_months: number;
  max_users: number;
  max_billable_storage_bytes: number;
  features_uz: string[];
  features_ru: string[];
  feature_keys: string[];
  is_popular: boolean;
  is_active: boolean;
  is_trial: boolean;
  trial_days: number | null;
  reason: string;
}

export interface BillingPlanUpdateParams {
  name?: string;
  price_amount?: number;
  currency?: string;
  max_users?: number;
  max_billable_storage_bytes?: number;
  features_uz?: string[];
  features_ru?: string[];
  feature_keys?: string[];
  is_popular?: boolean;
  is_active?: boolean;
  is_trial?: boolean;
  trial_days?: number | null;
}

export interface BillingEntitlements {
  plan_code: string | null;
  plan_name: string | null;
  max_users: number | null;
  current_user_count: number;
  max_billable_storage_bytes: number | null;
  feature_keys: string[];
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

// Unauthenticated -- backs the public landing page's pricing section, only
// returns is_active=true plans, no internal/audit fields.
export function listPublicPlans() {
  return apiFetch<BillingPlanPublic[]>("/api/v1/billing/plans/public");
}

// Platform Admin only, privileged (2FA must already be enabled).
export function createPlan(accessToken: string, params: BillingPlanCreateParams) {
  return apiFetch<BillingPlan>("/platform/v1/billing/plans", {
    method: "POST",
    accessToken,
    body: params,
  });
}

export function updatePlan(accessToken: string, code: string, params: BillingPlanUpdateParams) {
  return apiFetch<BillingPlan>(`/platform/v1/billing/plans/${encodeURIComponent(code)}`, {
    method: "PATCH",
    accessToken,
    body: params,
  });
}

export function listPlatformPlans(accessToken: string) {
  return apiFetch<BillingPlan[]>("/platform/v1/billing/plans", { accessToken });
}

// Single source of truth for what the current tenant's plan allows -- backs
// the dashboard sidebar's lock/Premium badges and the /dashboard/settings/billing page.
export function getEntitlements(accessToken: string) {
  return apiFetch<BillingEntitlements>("/api/v1/billing/entitlements", { accessToken });
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
