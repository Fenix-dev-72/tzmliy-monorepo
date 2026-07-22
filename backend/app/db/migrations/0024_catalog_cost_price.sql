-- Client requirement (2026-07): each catalog category can carry an optional
-- admin-entered cost price ("tannarx"), separate from and independent of the
-- fixed_price_amount/fixed_price_currency added in 0023 -- a category can be
-- price-flexible at sale time while still having a known cost, so this is not
-- folded into the fixed-price pairing. Used by finance/service.py's profit
-- summary to compute umumiy daromad/foyda (total revenue/profit).
ALTER TABLE catalog_categories
    ADD COLUMN cost_price_amount BIGINT,
    ADD COLUMN cost_price_currency TEXT CHECK (cost_price_currency IN ('UZS', 'USD'));

ALTER TABLE catalog_categories
    ADD CONSTRAINT catalog_categories_cost_price_pairing
    CHECK ((cost_price_amount IS NULL) = (cost_price_currency IS NULL));

ALTER TABLE catalog_categories
    ADD CONSTRAINT catalog_categories_cost_price_amount_nonnegative
    CHECK (cost_price_amount IS NULL OR cost_price_amount >= 0);
