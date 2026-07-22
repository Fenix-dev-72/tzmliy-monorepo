-- Client requirement (2026-07-11): bonus plans need to support a flat
-- per-sale amount ("1 ta sotuvga 100 000 so'm") as an alternative to a
-- percentage commission, and different bonus rules per product/category
-- ("har bir mahsulot uchun har xil bonus"). commission_bps stays NOT NULL
-- (existing constraint) -- fixed_per_sale plans simply set it to 0, unused.
ALTER TABLE bonus_plans
    ADD COLUMN bonus_type TEXT NOT NULL DEFAULT 'percent' CHECK (bonus_type IN ('percent', 'fixed_per_sale')),
    ADD COLUMN fixed_amount BIGINT CHECK (fixed_amount IS NULL OR fixed_amount >= 0),
    ADD COLUMN fixed_amount_currency TEXT CHECK (fixed_amount_currency IN ('UZS', 'USD')),
    ADD COLUMN catalog_category_id UUID REFERENCES catalog_categories(id);

ALTER TABLE bonus_plans
    ADD CONSTRAINT bonus_plans_type_fields_check CHECK (
        (bonus_type = 'percent' AND fixed_amount IS NULL AND fixed_amount_currency IS NULL)
        OR (bonus_type = 'fixed_per_sale' AND fixed_amount IS NOT NULL AND fixed_amount_currency IS NOT NULL)
    );

CREATE INDEX bonus_plans_category_idx ON bonus_plans (tenant_id, catalog_category_id) WHERE catalog_category_id IS NOT NULL;

-- A payroll entry can now be the blended result of several plans (one
-- general + one or more category-specific) contributing to the same
-- currency total, so it no longer maps to a single bonus_plan_id.
ALTER TABLE payroll_entries ALTER COLUMN bonus_plan_id DROP NOT NULL;
