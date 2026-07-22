-- Real product/inventory entity, nested under a catalog category (client
-- requirement, 2026-07-16: "product qo'shiladi, tan narxi, sotish narxi,
-- soni bo'ladi, ombor qo'shiladi"). Category-level fixed/cost price is
-- removed in this same migration -- pricing now lives on the product.
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    category_id UUID NOT NULL REFERENCES catalog_categories(id),
    name TEXT NOT NULL,
    cost_price_amount BIGINT NOT NULL,
    cost_price_currency TEXT NOT NULL CHECK (cost_price_currency IN ('UZS', 'USD')),
    sell_price_amount BIGINT NOT NULL,
    sell_price_currency TEXT NOT NULL CHECK (sell_price_currency IN ('UZS', 'USD')),
    stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    photo_object_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON products
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX products_tenant_category_idx ON products (tenant_id, category_id);

-- Pricing moves from category to product (client's explicit choice) --
-- category CRUD goes back to name/parent only, same as before Faza 3's
-- fixed/cost price additions.
ALTER TABLE catalog_categories DROP COLUMN fixed_price_amount;
ALTER TABLE catalog_categories DROP COLUMN fixed_price_currency;
ALTER TABLE catalog_categories DROP COLUMN cost_price_amount;
ALTER TABLE catalog_categories DROP COLUMN cost_price_currency;

-- A sale can now reference the specific product sold (nullable -- freeform/
-- category-only sales keep working exactly as before, same nullability
-- precedent as catalog_category_id itself). quantity defaults to 1 so every
-- pre-existing row stays valid without a backfill.
ALTER TABLE sales ADD COLUMN product_id UUID REFERENCES products(id);
ALTER TABLE sales ADD COLUMN quantity INT NOT NULL DEFAULT 1 CHECK (quantity >= 1);
