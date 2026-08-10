-- 2FA switched from TOTP (Google Authenticator/Authy, QR-code scan) to
-- email-delivered one-time codes. Codes themselves live in Redis (see
-- app/modules/auth/otp_store.py), same convention as phone-OTP/registration/
-- password-reset -- no new table needed. totp_secret is no longer written or
-- read anywhere in the app, so it's dropped here. totp_enabled stays: it's
-- still the generic "2FA is on" flag read by the JWT claim, the
-- PRIVILEGED_PERMISSIONS gate, and Platform Admin's create_tenant_admin_user
-- check -- renaming it would be a purely cosmetic, wide-blast-radius change.
ALTER TABLE users DROP COLUMN totp_secret;
ALTER TABLE platform_admins DROP COLUMN totp_secret;
