-- TZ: "Har bir moliyaviy POST so'rovi Idempotency-Key ... talab qiladi."
-- sale_payments already had this (0009). Extend the same ON CONFLICT DO
-- NOTHING RETURNING + compare-on-replay pattern to the other financial
-- create-POSTs: sale creation (posts a ledger charge) and adjustment_request
-- creation. All three tables were empty when this migration was written, so
-- idempotency_key can be added NOT NULL directly (no backfill needed).

ALTER TABLE sales ADD COLUMN idempotency_key TEXT NOT NULL;
ALTER TABLE sales ADD CONSTRAINT sales_tenant_idempotency_key_unique UNIQUE (tenant_id, idempotency_key);

ALTER TABLE adjustment_requests ADD COLUMN idempotency_key TEXT NOT NULL;
ALTER TABLE adjustment_requests ADD CONSTRAINT adjustment_requests_tenant_idempotency_key_unique UNIQUE (tenant_id, idempotency_key);

-- Approve/reject mutate an existing row rather than creating one, so a
-- separate UNIQUE column doesn't apply -- instead the key actually used to
-- transition out of 'pending' is stored here, so a retry with the *same*
-- key can be recognized as a safe replay (return the already-decided row)
-- instead of erroring just because the request is no longer pending.
ALTER TABLE adjustment_requests ADD COLUMN review_idempotency_key TEXT;

ALTER TABLE bonus_plans ADD COLUMN idempotency_key TEXT NOT NULL;
ALTER TABLE bonus_plans ADD CONSTRAINT bonus_plans_tenant_idempotency_key_unique UNIQUE (tenant_id, idempotency_key);
