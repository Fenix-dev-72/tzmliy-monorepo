-- Plans stop being marketing-copy-only: a real trial plan (so registration
-- can point at an actual billing_plans row instead of a bare tenants column
-- default), plus a machine-readable feature_keys array so specific
-- capabilities (CRM integrations, exports, ...) can be gated per plan
-- instead of every RBAC permission being billing-plan-independent.
ALTER TABLE billing_plans
    ADD COLUMN is_trial BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN trial_days INTEGER,
    ADD COLUMN feature_keys TEXT[] NOT NULL DEFAULT '{}',
    ADD CONSTRAINT billing_plans_trial_days_pairing
        CHECK ((is_trial AND trial_days IS NOT NULL AND trial_days > 0) OR (NOT is_trial AND trial_days IS NULL));

-- At most one trial plan can exist at a time -- the registration flow looks
-- up "the" trial plan by is_trial alone, with no ordering/tiebreak logic.
CREATE UNIQUE INDEX billing_plans_single_trial ON billing_plans (is_trial) WHERE is_trial;

INSERT INTO billing_plans (
    code, name, price_amount, currency, billing_period_months, max_users,
    max_billable_storage_bytes, features_uz, features_ru, is_popular, is_active,
    is_trial, trial_days, feature_keys
) VALUES (
    'trial', 'Bepul boshlash', 0, 'UZS', 1, 3, 1073741824,
    ARRAY['15 kun bepul', '3 tagacha xodim', 'Asosiy CRM va katalog', '1 GB xotira'],
    ARRAY['15 дней бесплатно', 'До 3 сотрудников', 'Базовый CRM и каталог', '1 ГБ хранилища'],
    false, true, true, 15, '{}'
);

-- Seeded to match the marketing copy already in features_uz/features_ru for
-- these plans (AmoCRM/Bitrix24/Meta Ads integrations, Telegram bot
-- notifications, advanced report export) -- starter and trial get none.
UPDATE billing_plans SET feature_keys = ARRAY['crm_integrations', 'telegram_notifications'] WHERE code = 'business';
UPDATE billing_plans SET feature_keys = ARRAY['crm_integrations', 'meta_ads', 'telegram_notifications', 'advanced_reports'] WHERE code = 'enterprise';
