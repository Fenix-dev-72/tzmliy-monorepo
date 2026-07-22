-- Lets an admin reverse a mistakenly-entered payment with one click (client
-- requirement, 2026-07-16 -- found via a real overpayment mistake in
-- production). NULL = not reversed; set once, guarded against a second
-- reversal by finance/repository.py's mark_payment_reversed using
-- `WHERE reversed_at IS NULL` (atomic, race-safe).
ALTER TABLE sale_payments ADD COLUMN reversed_at TIMESTAMPTZ;
