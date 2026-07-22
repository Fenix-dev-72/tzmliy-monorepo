-- Client requirement (2026-07-15): AmoCRM deals ("сделка") should create a
-- real sales row here, not just a customers/lead row -- and it must be
-- visibly distinguishable in the UI which sales came from a CRM integration
-- vs. were created manually in Tizimly ("ajratib olish oson bo'lishi uchun").
-- Nullable, no backfill needed -- every existing sale was created manually.
ALTER TABLE sales ADD COLUMN source TEXT CHECK (source IS NULL OR source IN ('amocrm', 'bitrix24'));
