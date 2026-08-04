-- Address/location field for the customer contact card (client request
-- 2026-07-28, alongside the create-form's email/company from 0051) --
-- nullable, same pairing convention as the rest of the optional contact
-- fields on this table.
ALTER TABLE customers ADD COLUMN address TEXT;
