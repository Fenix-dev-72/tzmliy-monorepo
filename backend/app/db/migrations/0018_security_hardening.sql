-- Security hardening pass (post-Faza-12): brute-force protection for every
-- password-based login surface (dashboarduz-security-gaps memory item #1).
--
-- Account lockout state lives on the credential row itself: N consecutive
-- failures (Settings.login_max_failed_attempts) set locked_until, and until
-- it passes, login is rejected without even verifying the password. A short
-- lockout (Settings.login_lockout_minutes) plus per-IP rate limiting keeps
-- this from being a cheap victim-account DoS vector while still killing
-- offline-speed credential stuffing.
--
-- OTP already has its own per-code attempt_count (0003) -- this covers the
-- three surfaces that had nothing: tenant users, platform admins, dashboards.
ALTER TABLE users ADD COLUMN failed_login_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TIMESTAMPTZ;

ALTER TABLE platform_admins ADD COLUMN failed_login_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE platform_admins ADD COLUMN locked_until TIMESTAMPTZ;

ALTER TABLE dashboards ADD COLUMN failed_login_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE dashboards ADD COLUMN locked_until TIMESTAMPTZ;
