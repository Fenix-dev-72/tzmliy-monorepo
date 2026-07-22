-- Seller KPI dashboard expansion (2026-07-14): "Sotuv - Onlayn/Oflayn/Intensiv"
-- is a real per-sale dimension, not decorative -- nullable/no default so
-- existing sales show as an "Aniqlanmagan" bucket in the UI rather than being
-- hidden or forced into a guessed category.
ALTER TABLE sales ADD COLUMN delivery_mode TEXT CHECK (delivery_mode IN ('online', 'offline', 'intensive'));

-- crm_activities was only ever indexed by customer_id (crm_activities_customer_idx)
-- -- the new per-seller "Yozuvlar"/"Bosqich o'zgarishi" KPI queries filter by
-- actor_user_id instead, which would otherwise be a full table scan.
CREATE INDEX crm_activities_actor_idx ON crm_activities (tenant_id, actor_user_id, created_at);
