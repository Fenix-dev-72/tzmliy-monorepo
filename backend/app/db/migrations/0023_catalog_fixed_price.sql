-- Client requirement (2026-07): a catalog category can carry an admin-set
-- fixed price, or be left "flexible" (negotiable at sale time). Both columns
-- null = flexible; both set = fixed. The app also validates this pairing
-- (catalog/service.py) so a bad request gets a clean 400 instead of a raw
-- constraint-violation 500, but the DB constraint is the real backstop.
ALTER TABLE catalog_categories
    ADD COLUMN fixed_price_amount BIGINT,
    ADD COLUMN fixed_price_currency TEXT CHECK (fixed_price_currency IN ('UZS', 'USD'));

ALTER TABLE catalog_categories
    ADD CONSTRAINT catalog_categories_fixed_price_pairing
    CHECK ((fixed_price_amount IS NULL) = (fixed_price_currency IS NULL));

ALTER TABLE catalog_categories
    ADD CONSTRAINT catalog_categories_fixed_price_amount_nonnegative
    CHECK (fixed_price_amount IS NULL OR fixed_price_amount >= 0);
