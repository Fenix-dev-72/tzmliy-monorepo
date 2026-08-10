-- Opens up billing_plans from "exactly 3 fixed rows" to any number of
-- Platform-Admin-created plans (2026-08-09, explicit user request: "tarif
-- reja yaratishlar ham kerak"). The original CHECK (code IN
-- ('starter','business','enterprise')) structurally forbade a 4th plan --
-- replaced with a plain slug-format check so `code` stays a stable,
-- URL/JSON-safe identifier without enumerating specific values.
ALTER TABLE billing_plans DROP CONSTRAINT billing_plans_code_check;
ALTER TABLE billing_plans ADD CONSTRAINT billing_plans_code_check CHECK (code ~ '^[a-z0-9-]+$');

-- Marketing-facing fields so the landing page's pricing cards can be driven
-- by the same row a Platform Admin edits here, instead of a second,
-- independently-hardcoded copy in the frontend (which had already drifted
-- out of sync with these seed values before this migration).
ALTER TABLE billing_plans
    ADD COLUMN features_uz TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN features_ru TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN is_popular BOOLEAN NOT NULL DEFAULT false;

-- Backfill the three existing seeded plans with the copy currently
-- hardcoded in frontend/src/pages/landing/sections/PricingSection.tsx, so
-- swapping that section over to the API doesn't blank out its own content.
UPDATE billing_plans SET
    features_uz = ARRAY[
        '150 tagacha faol savdo',
        '3 tagacha xodim',
        'Asosiy CRM va katalog',
        'Telegram bildirishnomalar',
        'Email qo''llab-quvvatlash'
    ],
    features_ru = ARRAY[
        'До 150 активных продаж',
        'До 3 сотрудников',
        'Базовый CRM и каталог',
        'Уведомления в Telegram',
        'Поддержка по email'
    ]
WHERE code = 'starter';

UPDATE billing_plans SET
    features_uz = ARRAY[
        'Cheksiz savdo',
        '15 tagacha xodim',
        'To''liq CRM + integratsiyalar',
        'Analitika va hisobotlar',
        'Bonus/KPI hisoblash',
        'Ustuvor qo''llab-quvvatlash'
    ],
    features_ru = ARRAY[
        'Неограниченные продажи',
        'До 15 сотрудников',
        'Полный CRM + интеграции',
        'Аналитика и отчёты',
        'Расчёт бонусов/KPI',
        'Приоритетная поддержка'
    ],
    is_popular = true
WHERE code = 'business';

UPDATE billing_plans SET
    features_uz = ARRAY[
        'Business''dagi barcha imkoniyatlar',
        'Cheksiz xodim',
        'Shaxsiy sozlash',
        'SLA kafolati',
        'Maxsus integratsiyalar',
        'Shaxsiy menejer'
    ],
    features_ru = ARRAY[
        'Всё из тарифа Business',
        'Неограниченно сотрудников',
        'Индивидуальная настройка',
        'Гарантия SLA',
        'Кастомные интеграции',
        'Персональный менеджер'
    ]
WHERE code = 'enterprise';
