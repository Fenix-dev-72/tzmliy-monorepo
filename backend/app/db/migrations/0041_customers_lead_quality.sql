-- Seller/lead analytics foundation (client requirement, 2026-07-15):
-- "har bir sotuvchi nechta lid bilan ishlayotgani, konversiyasi, sifatli/
-- sifatsiz lid taqsimoti" needs the lead's own source/quality/outcome
-- recorded, not just its current pipeline stage.

-- A lead with no phone number should still sync from a CRM (flagged
-- low-quality automatically), not be dropped -- mirrors users.phone's own
-- nullable-email precedent (0021_nullable_email.sql). Multiple NULL phones
-- don't violate UNIQUE(tenant_id, phone): Postgres treats NULLs as distinct.
ALTER TABLE customers ALTER COLUMN phone DROP NOT NULL;

-- NULL = created directly in Tizimly (manual entry); otherwise which
-- integration this lead was synced from.
ALTER TABLE customers ADD COLUMN source TEXT;

-- Client's own definition: "sifatsiz" = no phone left, OR called and never
-- answered -- AND the lead was subsequently closed without a sale. Computed
-- (not user-editable) once a deal reaches a terminal CRM outcome; 'unrated'
-- covers every lead that hasn't reached that point yet, or was lost for an
-- unrelated reason.
ALTER TABLE customers ADD COLUMN quality TEXT NOT NULL DEFAULT 'unrated'
    CHECK (quality IN ('quality', 'low_quality', 'unrated'));

-- Free-text reason a lead was lost, sourced from the CRM (AmoCRM's own
-- loss_reason) when available, else a synthetic reason ("no_phone",
-- "no_answer") this module fills in itself.
ALTER TABLE customers ADD COLUMN lost_reason TEXT;
