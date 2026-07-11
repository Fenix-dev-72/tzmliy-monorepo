-- Phone-only self-registration (0020_self_registration.sql) needs email to
-- be optional -- a user can register with just a phone number (verified via
-- Telegram Gateway) and never set an email at all. At least one of
-- email/phone must still be present. A separate migration from 0020 on
-- purpose: 0020 is the identifier/uniqueness infrastructure, this is the
-- one column-nullability change layered on top of it.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_email_or_phone_required CHECK (email IS NOT NULL OR phone IS NOT NULL);
