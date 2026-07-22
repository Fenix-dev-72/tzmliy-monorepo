-- Third performance-hardening pass (optimize.md #19, 2026-07-17) --
-- subscription_payments' list_subscription_payments query orders by
-- created_at DESC with no supporting index.

CREATE INDEX subscription_payments_created_idx ON subscription_payments (tenant_id, created_at DESC);
