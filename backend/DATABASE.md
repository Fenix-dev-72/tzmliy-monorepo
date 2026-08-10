# Tzmliy — ma'lumotlar bazasi sxemasi

Bu fayl production PostgreSQL bazasining **haqiqiy joriy holatini** hujjatlashtiradi (58 ta migratsiya — `app/db/migrations/0001`...`0058` — qo'llanganidan keyingi natija, 2026-08-10 holatiga). Qo'lda yozilmagan — to'g'ridan-to'g'ri bazadan (`information_schema`) olingan, shuning uchun kod bilan mos.

Tuzilish (nima uchun): to'liq migratsiya tarixini o'qish o'rniga, "hozir baza qanday ko'rinadi" savoliga tezkor javob berish uchun.

---

## Umumiy konventsiyalar

- **Multi-tenancy**: deyarli har bir jadval `tenant_id UUID` ustuniga ega va **Row-Level Security (RLS)** bilan himoyalangan (`ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`) — ilova `app_user` roli orqali ulanadi (RLS'ni chetlab o'ta olmaydi), `app.tenant_id` session-parametri orqali qaysi tenant ma'lumotlari ko'rinishini nazorat qiladi. Quyida har bir jadval yonida **RLS: ha/yo'q** deb belgilangan.
- **Platform-darajasi jadvallar** (RLS yo'q — `tenant_id`ga ega emas yoki umumiy): `tenants`, `platform_admins`, `platform_admin_sessions`, `audit_logs`, `billing_plans`, `backup_settings`, `complaints`, `schema_migrations`, `subscription_payment_provider_refs`, `user_login_identifiers`.
- **Pul**: hech qachon `float`/`numeric` emas — har doim `BIGINT` (so'm — butun son, USD — sentda). Valyuta alohida `currency TEXT` ustunida (`'UZS'`/`'USD'`).
- **ID'lar**: deyarli barcha jadvallar `id UUID DEFAULT gen_random_uuid()` PRIMARY KEY.
- **Idempotency**: moliyaviy `INSERT`larni yaratadigan jadvallarda (`sales`, `sale_payments`, `adjustment_requests`, `bonus_plans`, `subscription_payments`) `idempotency_key TEXT` + `UNIQUE(tenant_id, idempotency_key)` bor — takroriy so'rovlarni xavfsiz qayta yuborish uchun.
- **Partitioning**: `ledger_entries`, `calls`, `webhook_events`, `audit_logs` — oylik `RANGE` partition (masalan `calls_2026_08`) + har biri uchun `_default` zaxira partition. Quyidagi jadvallarda faqat **ota (parent) jadval** tavsiflangan — partitsiyalar aynan bir xil ustunlarga ega.
- **Append-only (o'chirilmaydigan/tahrirlanmaydigan) tarix jadvallari**: `ledger_entries`, `sale_changes`, `audit_logs`, `crm_activities`, `notification_delivery_log`, `crm_lead_syncs`, `webhook_events` — bularga faqat `INSERT` qilinadi, hech qachon `UPDATE`/`DELETE` qilinmaydi.

---

## 1. Auth / foydalanuvchilar (`app/modules/auth/`)

### `users` — RLS: ha
Tenant xodimi/foydalanuvchisi. `email`/`phone` global (butun tizim bo'yicha) unikal — tenant_slug'siz login qilish shu orqali ishlaydi.

| Ustun | Tur | NULL | Izoh |
|---|---|---|---|
| id | uuid | NO | PK |
| tenant_id | uuid | NO | FK → tenants.id |
| email | text | YES | global UNIQUE, ixtiyoriy (faqat-telefon ro'yxatdan o'tish mumkin) |
| phone | text | YES | qisman-unikal (NULL bo'lmaganda) |
| full_name | text | YES | |
| password_hash | text | NO | bcrypt |
| role_id | uuid | NO | FK → roles.id |
| is_active | boolean | NO | default true |
| totp_enabled | boolean | NO | 2FA yoqilganmi (email-OTP, 2026-08-10dan) |
| failed_login_attempts | integer | NO | qulflash hisoblagichi |
| locked_until | timestamptz | YES | |
| telegram_chat_id | bigint | YES | shaxsiy Telegram bog'lanishi |
| telegram_link_token_hash | text | YES | |
| telegram_link_token_expires_at | timestamptz | YES | |
| created_at / updated_at | timestamptz | NO | |

**Eslatma**: `totp_secret` ustuni 2026-08-10da o'chirilgan (0058-migratsiya) — 2FA endi Redis-asoslangan email-OTP kod bilan ishlaydi, doimiy saqlanadigan sirni talab qilmaydi.

### `roles` — RLS: ha
Tenant-maxsus rollar (`admin`/`manager`/`agent`/`finance` — `is_system=true` bilan avtomatik yaratiladi, + moslashtirilgan rollar).
`id, tenant_id→tenants, name, is_system, created_at`. UNIQUE(tenant_id, name).

### `role_permissions` — RLS: ha
Composite PK `(role_id, permission_key)`. `tenant_id→tenants`, `role_id→roles`. Permission kalitlari kodda qattiq belgilangan (`auth/permissions.py`), jadval emas.

### `refresh_sessions` — RLS: ha
`id, tenant_id→tenants, user_id→users, token_hash, expires_at, revoked_at, created_at`. Har login/refresh'da yangi qator, eskisi bekor qilinadi (rotation).

### `user_login_identifiers` — RLS: yo'q (platform-darajasi)
`identifier` (PK, email yoki telefon) `→ identifier_type, tenant_id→tenants, user_id→users, created_at`. Login vaqtida "bu identifikator qaysi tenant'ga tegishli" degan tuxum-tovuq muammosini hal qiladi (`users` RLS bilan yopiq bo'lgani uchun).

---

## 2. Platform (Platform Admin, tenant hayot davri)

### `tenants` — RLS: yo'q
`id, name, slug (UNIQUE), status ('trial'/'active'/'past_due'/'grace'/'suspended'/'cancelled'), trial_ends_at, created_at, updated_at`.

### `platform_admins` — RLS: yo'q
`id, email (UNIQUE), password_hash, is_active, totp_enabled, failed_login_attempts, locked_until, created_at`. (`totp_secret` ham 2026-08-10da o'chirilgan.)

### `platform_admin_sessions` — RLS: yo'q
`id, admin_id→platform_admins, token_hash, expires_at, revoked_at, created_at`.

### `audit_logs` — RLS: yo'q, **partitioned** (oylik)
Platform Admin'ning tenant ma'lumotiga tegadigan har bir imtiyozli amali (masalan `create_tenant_admin_user`) shu yerga yoziladi, o'chirib bo'lmaydi.
`id, actor_type, actor_id, tenant_id→tenants (nullable), action, reason, created_at`. Composite PK `(id, created_at)` — partition kaliti.

### `complaints` — RLS: yo'q
Tenant foydalanuvchisi Platform Admin'ga yuborgan shikoyat/murojaat.
`id, tenant_id→tenants, created_by_user_id, subject, message, status ('open'/...), resolved_by_admin_id→platform_admins, resolved_at, created_at`.

### `schema_migrations` — RLS: yo'q
`version (PK), applied_at`. Migratsiya runner'ning o'z holat jadvali (`app/db/migrate.py`).

---

## 3. Katalog / mahsulotlar (`catalog`, `products`)

### `catalog_categories` — RLS: ha
Cheksiz chuqurlikdagi daraxt (adjacency-list). `id, tenant_id→tenants, parent_id→catalog_categories (self-FK), name, created_at, updated_at`. Ikkita qisman-unikal indeks: `(tenant_id, name) WHERE parent_id IS NULL` (ildiz darajasi) va `(tenant_id, parent_id, name) WHERE parent_id IS NOT NULL` (bir xil ota ostidagi bolalar) — shu orqali bir xil ismli ildiz kategoriyalar ham bloklanadi (oddiy composite UNIQUE buni qila olmasdi, chunki SQL NULL'lar bir-biriga teng emas).

**Diqqat — `backend/CLAUDE.md` bu yerda eskirgan**: u kategoriya darajasida `fixed_price_amount/currency` va `cost_price_amount/currency` ustunlari borligini yozadi (Faza 3, 2026-07-12). Bu **haqiqat emas** — `0042_products.sql` migratsiyasi (2026-07-16, mijozning aniq talabi bilan: "product qo'shiladi, tan narxi, sotish narxi, soni bo'ladi") narxni **kategoriyadan `products` jadvaliga** ko'chirgan va bu to'rtta ustunni butunlay o'chirgan. Hozir `catalog_categories`da narx bilan bog'liq hech qanday ustun yo'q — narx faqat `products` jadvalida yashaydi.

### `products` — RLS: ha
`id, tenant_id→tenants, category_id→catalog_categories, name, cost_price_amount/currency, sell_price_amount/currency, stock_quantity, photo_object_key, created_at, updated_at`.

---

## 4. Mijozlar (`customers`)

### `customers` — RLS: ha
Lead va mijoz **bitta qatorda** (`stage` ustuni orqali bosqichma-bosqich o'zgaradi).
`id, tenant_id→tenants, full_name, phone (UNIQUE tenant ichida), email, company, address, notes, responsible_user_id→users, created_by_user_id→users, stage ('lead'/'qualified'/'customer'/'lost'), source, quality, lost_reason, created_at, updated_at`.

### `crm_activities` — RLS: ha, append-only
Qo'lda yozilgan eslatma/qo'ng'iroq tarixi (ichki, tashqi CRM integratsiyasidan farqli).
`id, tenant_id→tenants, customer_id→customers, actor_user_id→users, activity_type, note, created_at`.

---

## 5. Savdo (`sales`)

### `sales` — RLS: ha
Shartnoma qatori — narx/muddat/holat, optimistic concurrency.
`id, tenant_id→tenants, customer_id→customers, catalog_category_id→catalog_categories (ixtiyoriy), product_id→products (ixtiyoriy), responsible_user_id→users, currency, price_amount, quantity, deadline, status ('active'/'completed'/'cancelled'), version (optimistic lock), delivery_mode, source, idempotency_key, created_at, updated_at`. UNIQUE(tenant_id, idempotency_key).

### `sale_changes` — RLS: ha, append-only
Har bir `sales` maydon o'zgarishi shu yerga yoziladi.
`id, tenant_id→tenants, sale_id→sales, actor_user_id→users, changed_fields (jsonb), reason, created_at`.

---

## 6. Moliya (`finance`)

### `sale_payments` — RLS: ha
`id, tenant_id→tenants, sale_id→sales, amount, currency, method, recorded_by_user_id→users, idempotency_key, reversed_at, created_at`. UNIQUE(tenant_id, idempotency_key).

### `ledger_entries` — RLS: ha, append-only, **partitioned** (oylik)
Yagona haqiqat manbasi — sotuvning balansi har doim `SUM(amount)`, alohida keshlangan ustun emas. `amount` ishorali (musbat = qarz oshadi, manfiy = kamayadi).
`id, tenant_id→tenants, sale_id→sales (nullable), customer_id→customers (nullable), entry_type ('charge'/'payment'/'refund'/'adjustment'), amount, currency, related_payment_id→sale_payments, related_refund_id→refunds, description, created_by_user_id→users, created_at`. Composite PK `(id, created_at)`.

### `adjustment_requests` — RLS: ha
Refund/tarif-o'zgartirish uchun `pending`→`approved`/`rejected` konvert.
`id, tenant_id→tenants, sale_id→sales, requested_by_user_id→users, type, payload (jsonb), status, reviewed_by_user_id→users, review_reason, reviewed_at, version, idempotency_key, review_idempotency_key, created_at`. UNIQUE(tenant_id, idempotency_key).

### `refunds` — RLS: ha
Tasdiqlangan refund'ning o'zgarmas yozuvi. `id, tenant_id→tenants, sale_id→sales, adjustment_request_id→adjustment_requests (UNIQUE), amount, currency, created_by_user_id→users, created_at`.

### `bonus_plans` — RLS: ha
Versiyalangan bonus qoidasi (foiz yoki sotuv-boshiga qat'iy summa).
`id, tenant_id→tenants, name, applies_to_role_id→roles, catalog_category_id→catalog_categories (ixtiyoriy — bo'sh=barcha kategoriya), bonus_type ('percent'/'fixed_per_sale'), commission_bps, fixed_amount, fixed_amount_currency, effective_from, effective_to, idempotency_key, created_at`. UNIQUE(tenant_id, idempotency_key).

### `payroll_entries` — RLS: ha
Hisoblangan ish haqi natijasi. `id, tenant_id→tenants, user_id→users, period_start, period_end, bonus_plan_id→bonus_plans (nullable — aralashtirilgan bo'lsa), base_amount, bonus_amount, currency, computed_by_user_id→users, computed_at`. UNIQUE(tenant_id, user_id, period_start, period_end, currency).

### `payroll_calculation_jobs` — RLS: ha
Fon-ishchi navbat jadvali (`pending`/`processing`/`done`/`failed`).
`id, tenant_id→tenants, period_start, period_end, user_id→users (ixtiyoriy — bitta xodim uchun), status, error, requested_by_user_id→users, created_at, started_at, finished_at`.

---

## 7. Qo'ng'iroqlar / davomat (`calls`, `attendance`)

### `calls` — RLS: ha, **partitioned** (oylik, `started_at` bo'yicha)
`id, tenant_id→tenants, provider ('utel'/'moi_zvonki'), external_call_id, direction, from_number, to_number, responsible_user_id→users, duration_seconds, status, started_at, ended_at, recording_object_key, pending_recording_url, recording_download_attempts, recording_claimed_at, created_at`. Composite PK `(id, started_at)`. UNIQUE(tenant_id, provider, external_call_id, started_at).

### `call_manager_mappings` — RLS: ha
Tashqi provayder agent ID'sini ichki foydalanuvchiga bog'lash. `id, tenant_id→tenants, provider, external_agent_id, user_id→users, is_active, created_at`. UNIQUE(tenant_id, provider, external_agent_id).

### `attendance` — RLS: ha
`id, tenant_id→tenants, user_id→users, check_in_at, check_out_at (NULL=hali ochiq), source ('manual'/...), created_at`.

---

## 8. Billing (platformning o'z SaaS daromadi — `finance`dan farqli!)

### `billing_plans` — RLS: yo'q (platform-darajasi)
`id, code (UNIQUE, slug), name, price_amount, currency, billing_period_months, max_users, max_billable_storage_bytes, is_active, is_popular, is_trial, trial_days, features_uz[], features_ru[] (marketing matni), feature_keys[] (mashina-o'qiladigan, gating uchun), created_at, updated_at`. Faqat bitta `is_trial=true` qator bo'lishi mumkin (qisman unikal indeks).

### `tenant_subscriptions` — RLS: ha
`id, tenant_id→tenants (UNIQUE — bitta faol obuna), billing_plan_id→billing_plans, current_period_start/end, warning_80_sent_at, warning_100_sent_at, created_at, updated_at`.

### `subscription_payments` — RLS: ha
`id, tenant_id→tenants, tenant_subscription_id→tenant_subscriptions, billing_plan_id→billing_plans, provider ('payme'/'click'/...), amount, currency, status, period_start/end, provider_transaction_id, provider_state, cancel_reason, created_by_user_id→users, created_by_admin_id→platform_admins, idempotency_key, review_idempotency_key, created_at, performed_at, cancelled_at`. UNIQUE(tenant_id, idempotency_key).

### `subscription_payment_provider_refs` — RLS: yo'q (platform-darajasi)
Composite PK `(provider, provider_transaction_id)` → `tenant_id, subscription_payment_id→subscription_payments`. Payme'ning tashqi tranzaksiya ID'sini qaysi tenant'ga tegishli ekanini `tenant_connection` ochishdan oldin aniqlash uchun kichik lookup jadval.

### `storage_usage_snapshots` — RLS: ha
Kunlik hisoblangan xotira sarfi (Celery Beat, 03:30).
`id, tenant_id→tenants (UNIQUE snapshot_date bilan birga), snapshot_date, db_bytes, object_storage_bytes, total_bytes, billable_storage_limit_bytes, usage_ratio_bps (baza-punkt, 10000=100%), computed_at`.

---

## 9. Bildirishnomalar (`notifications`, `backups`)

### `notification_outbox` — RLS: ha
`id, tenant_id→tenants, channel, telegram_chat_id, text_body, document_object_key/filename, category_id→catalog_categories, status ('pending'/'sent'/'failed'/'dead_letter'), retry_count, max_retries, next_attempt_at, last_error, created_by_user_id→users, created_at, sent_at`.

### `notification_delivery_log` — RLS: ha, append-only
Har urinish uchun bitta qator. `id, tenant_id→tenants, outbox_id→notification_outbox, attempt_number, status, error, attempted_at`.

### `notification_schedules` — RLS: ha
Takrorlanuvchi (kunlik/haftalik) avtomatik xabar jadvali.
`id, tenant_id→tenants, label, send_time, days_of_week[], is_enabled, group_mapping_id→telegram_group_mappings, content_type ('leaderboard'/...), period, custom_text, user_ids[], role_ids[], last_sent_date, created_by_user_id→users, created_at, updated_at`.

### `telegram_group_mappings` — RLS: ha
`id, tenant_id→tenants, category_id→catalog_categories (ixtiyoriy), telegram_chat_id, label, is_active, created_at`.

### `telegram_group_link_requests` — RLS: ha
Guruh bog'lash uchun bir martalik token. `id, tenant_id→tenants, token_hash, category_id→catalog_categories, label, requested_by_user_id→users, expires_at, created_at`.

### `backup_settings` — RLS: yo'q (platform-darajasi, singleton — `id=1` cheklovi bilan)
`id, telegram_bot_token_encrypted, telegram_bot_username, telegram_chat_id, last_backup_at, last_backup_status, last_backup_error, link_token_hash, link_token_expires_at, updated_at`. Kunlik `pg_dump`→Telegram zaxira sozlamalari.

---

## 10. Tashqi integratsiyalar (`crm` moduli — AmoCRM/Bitrix24/Meta Ads)

### `integration_credentials` — RLS: ha
Har tenant-provayder juftligi uchun bitta qator (kalitlar Fernet bilan shifrlangan).
`id, tenant_id→tenants (UNIQUE provider bilan birga), provider, webhook_secret_encrypted, api_key_encrypted, refresh_token_encrypted, external_account_id, token_expires_at, is_active, created_at, updated_at`.

### `crm_manager_mappings` — RLS: ha
`id, tenant_id→tenants, provider, external_manager_id, user_id→users, is_active, created_at`. UNIQUE(tenant_id, provider, external_manager_id).

### `crm_lead_syncs` — RLS: ha, append-only (audit)
`id, tenant_id→tenants, customer_id→customers, provider, external_lead_id, direction ('inbound'/'outbound'), raw_payload (jsonb), synced_at`.

### `ad_campaigns` — RLS: ha
Meta Ads'dan tortib olingan kampaniya. `id, tenant_id→tenants (UNIQUE provider+external_campaign_id bilan), provider, external_campaign_id, name, status, created_at, updated_at`.

### `ad_insights` — RLS: ha
Kunlik reklama statistikasi. `id, tenant_id→tenants, campaign_id→ad_campaigns (UNIQUE insight_date bilan birga), insight_date, impressions, clicks, spend_amount, currency, created_at`.

---

## 11. Hisobotlar (`reports`)

### `report_export_jobs` — RLS: ha
CSV/XLSX eksport fon-ishchi navbati. `id, tenant_id→tenants, entity, format, status, error, file_object_key, requested_by_user_id→users, created_at, started_at, finished_at`.

---

## 12. Webhook infratuzilmasi (umumiy, provayderlararo)

### `webhook_events` — RLS: ha, **partitioned** (oylik)
`id, tenant_id→tenants, provider, external_event_id, raw_payload (jsonb), signature_valid, processed_at, created_at`. Composite PK `(id, created_at)`.

### `webhook_event_dedup` — RLS: ha, **partitioned emas**
Composite PK `(tenant_id, provider, external_event_id)`. `webhook_events`ning o'zi `created_at`ni ham noyoblik shartiga qo'sha olmagani uchun (har safar yangi qiymat) — haqiqiy idempotency darvozasi shu kichik jadval, `insert_webhook_event`dan **oldin** tekshiriladi.

---

## Boshqa hisobotlar jadvallar (analitika)

### `dashboards` — RLS: ha
Parolli, autentifikatsiyasiz kiosk-ekran hisobi (Live Leaderboard).
`id, tenant_id→tenants (UNIQUE name bilan birga), name, password_hash, failed_login_attempts, locked_until, created_at`.

---

## Diagramma (matn ko'rinishida, asosiy bog'lanishlar)

```
tenants (platform)
  └─ users ──┬─ roles ──── role_permissions
             ├─ refresh_sessions
             └─ user_login_identifiers (platform, users'ga FK)

  └─ customers ── crm_activities
       └─ sales ──┬─ sale_changes
                   ├─ sale_payments ──┐
                   ├─ adjustment_requests ── refunds     │
                   └─ ledger_entries ◄─────── (charge/payment/refund/adjustment) ┘

  └─ catalog_categories (self-referencing tree)
       └─ products ── sales.product_id

  └─ bonus_plans ── payroll_entries ◄─ payroll_calculation_jobs

  └─ calls ── call_manager_mappings
  └─ attendance

  └─ tenant_subscriptions ── subscription_payments ── subscription_payment_provider_refs (platform)
       (billing_plans — platform-darajasi, tenant'ga bog'lanmagan)

  └─ integration_credentials, crm_manager_mappings, crm_lead_syncs, ad_campaigns ── ad_insights

  └─ notification_outbox ── notification_delivery_log
  └─ notification_schedules ── telegram_group_mappings

  └─ report_export_jobs
  └─ webhook_events, webhook_event_dedup
  └─ dashboards
  └─ storage_usage_snapshots
  └─ complaints (platform_admins'ga ham FK)

platform_admins ── platform_admin_sessions
audit_logs (platform, tenants'ga ixtiyoriy FK)
backup_settings (singleton)
schema_migrations
```

---

## Manba va yangilash

Bu fayl `2026-08-10`da bazadan to'g'ridan-to'g'ri so'rov orqali generatsiya qilingan (`information_schema.columns`/`table_constraints`, lokal docker Postgres). Agar yangi migratsiya qo'shilsa, bu faylni qo'lda yangilash kerak — avtomatik sinxronlanmaydi. To'liq, so'z-boshiga aniq tafsilot kerak bo'lsa (masalan CHECK constraint matni, indeks nomlari), `backend/app/db/migrations/*.sql`ning o'zini o'qing yoki lokal bazada `\d+ <table_name>` buyrug'ini ishlating.

Modul-darajasidagi biznes-mantiq konventsiyalari (RLS qanday ishlaydi, pul qoidalari, idempotency naqshi, partitioning tarixi) uchun — `backend/CLAUDE.md`.
