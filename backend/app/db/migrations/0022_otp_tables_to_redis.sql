-- otp_codes, password_reset_tokens, and registration_verifications moved to
-- Redis (see app/modules/auth/otp_store.py) -- they were always ephemeral,
-- TTL-bound data with no downstream foreign-key references (verified: no
-- other table references any of these three), so dropping them is safe.
DROP TABLE otp_codes;
DROP TABLE password_reset_tokens;
DROP TABLE registration_verifications;
