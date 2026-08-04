-- Richer customer contact card (client request 2026-07-25, "mijoz yaratishni
-- AmoCRM bilan birhil qil ... barcha malumotlari saqlanishi kerak"): store the
-- email AmoCRM already sends on a lead (previously dropped on ingest), plus a
-- company and a free-text notes field. All nullable -- existing rows and
-- phone-only / minimal customers stay valid. Plain ADD COLUMN, so unlike an
-- INSERT into an RLS/FORCE table this DDL applies fine as the migrations owner
-- on prod (see 0050's caveat note).
ALTER TABLE customers ADD COLUMN email TEXT;
ALTER TABLE customers ADD COLUMN company TEXT;
ALTER TABLE customers ADD COLUMN notes TEXT;
