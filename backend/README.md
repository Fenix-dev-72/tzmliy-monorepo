# Dashboarduz

Savdo, moliya, mijozlar, qo'ng'iroqlar va CRM integratsiyalarini boshqaradigan ko'p-tenantli (multi-tenant) SaaS. FastAPI'da qurilgan modulli monolit (batafsil arxitektura uchun `CLAUDE.md`ga qarang, frontend integratsiyasi — qaysi API qaysi sahifada, auth ketma-ketligi, API'lar orasidagi bog'liqlik — uchun `FRONTEND.md`ga qarang).

## TZ bo'yicha bajarilgan ishlar

### ✅ Bajarilgan

**Auth (Faza 1)**
- Tenant foydalanuvchi va Platform Admin uchun alohida JWT audience (access/refresh, stateless access + revocable/rotating refresh session)
- Email yoki telefon (`identifier`) + parol bilan login — `tenant_slug` shart emas, `users.email`/`users.phone` butun tizim bo'yicha global unique
- Telefon OTP (`/otp/request`, `/otp/verify`) va parolni tiklash — ikkalasi ham account enumeration'ni oldini olish uchun har doim `204` qaytaradi
- Ixtiyoriy (opt-in) 2FA — TOTP setup/confirm, login `requires_2fa`/`pending_token` orqali ikki bosqichli bo'ladi
- **Privileged permission'lar uchun 2FA majburiy**: `users.manage`/`roles.manage`/`finance.manage`/`finance.approve`— token `totp_enabled` claim'ini tekshiradi, 2FA yoqilmagan bo'lsa 403

**Self-service ro'yxatdan o'tish (2026-07-09)**
- Tenant o'zi ro'yxatdan o'tadi (email **yoki** telefon, ikkalasi ham bir xil 3-bosqichli oqim: kod so'rash → tasdiqlash → tenant+admin yaratish+avtomatik login) — Platform Admin endi bunda qatnashmaydi, faqat nazoratchi
- Telefon orqali kod **Telegram Gateway** (rasmiy API) orqali real yetkaziladi, real VPS'da haqiqiy raqam bilan sinaldi
- Har bir yangi tenant avtomatik 15 kunlik trial bilan boshlanadi (`trial_ends_at`), muddat tugagach `billing`ning dunning job'i uni `suspended`ga o'tkazadi (agar to'lov qilinmagan bo'lsa)
- Platform-Admin-provisioned yo'l (eski, `POST /platform/v1/tenants` + `.../admin-user`) hali ham mavjud — endi ikkinchi, yordamchi yo'l sifatida

**RBAC (Faza 2)**
- `users.role` fixed enum o'rniga per-tenant, Tenant-Admin-tahrirlanadigan `roles` + `role_permissions`
- Permission kalitlari kod ichida fixed katalog (`auth/permissions.py`), access tokenga issue vaqtida joylanadi (claim-based check, DB round-trip yo'q)
- `admin`/`manager`/`agent`/`finance` — har bir yangi tenant uchun avtomatik seed qilinadigan tayyor rollar; Tenant Admin istalgan granular permission to'plami bilan custom rol qo'shishi mumkin

**Platform Admin 2FA + audit log**
- Platform Admin uchun ham xuddi shu opt-in TOTP 2FA
- Tenant'ning haqiqiy ma'lumotiga tegadigan yagona platform route (`create_tenant_admin_user`) — 2FA yoqilgan bo'lishini, sabab (`reason`) yozilishini va o'zgarmas audit yozuvini talab qiladi (oy bo'yicha partitioned `audit_logs`)

**Catalog (Faza 3)**
- Tenant o'zi xohlagan chuqurlikdagi mahsulot/xizmat ierarxiyasini yaratadi (adjacency-list daraxt, fixed-depth emas)
- Butun daraxt bitta so'rovda nested holda qaytariladi; sibling nomlar root va non-root uchun alohida partial unique index bilan himoyalangan

**Customers — mijoz kartochkasi + lead pipeline + CRM tarixi**
- Ism, telefon (tenant ichida unique — dedup), mas'ul menejer
- `stage` (`lead`/`qualified`/`customer`/`lost`) — lead va mijoz bitta jadvalda, bosqich bo'yicha farqlanadi
- Append-only `crm_activities` — qo'lda yoziladigan eslatma/qo'ng'iroq/email/uchrashuv, va `stage` o'zgarganda avtomatik `status_change` yozuvi

**Sales — savdo shartnomasi**
- Mijoz, (ixtiyoriy) catalog turkumi, mas'ul xodim, narx, valyuta (UZS/USD), muddat, holat (`active`/`completed`/`cancelled`, terminal holatlar qaytarilmaydi)
- Optimistik concurrency (`version` ustuni) — parallel tahrirlash 409 bilan aniqlanadi
- Har bir o'zgarish (narx, muddat, holat, mas'ul xodim) append-only `sale_changes` jadvaliga diff sifatida yoziladi
- Shartnoma yaratish `Idempotency-Key` talab qiladi (ledger charge ikki marta yozilmasligi uchun)

**Finance — to'lov, qarz, refund/tarif-almashtirish, bonus**
- **Har bir moliyaviy create-POST** (`sales`, `finance/payments`, `finance/adjustment-requests`, `finance/bonus-plans`) `Idempotency-Key` bilan xavfsiz qayta yuboriladi (double-charge/double-write yo'q); approve/reject esa mutate-in-place bo'lgani uchun alohida `review_idempotency_key` orqali retry-safe qilingan
- Append-only, ishorali (signed) `ledger_entries` — sale/mijoz balansi doim shu jadvaldan hisoblanadi, cache qilingan "balance" ustuni yo'q
- Refund va tarif-almashtirish uchun `pending`/`approved`/`rejected` approval workflow (`adjustment_requests`), alohida `finance.approve` permission bilan (2FA talab qiladi)
- Tasdiqlangan refund — o'zgarmas `refunds` yozuvi + ledger; tasdiqlangan tarif-almashtirish — `sales`ni versiyalab yangilaydi va `sale_changes`ga yoziladi
- Versiyalangan `bonus_plans` (komissiya basis-point'da) + talab bo'yicha (`POST /finance/payroll/calculate`) hisoblanadigan `payroll_entries` — background worker/scheduler hali yo'q, shuning uchun avtomatik emas

**Calls (Faza 7) — UTEL/Мои звонки integratsiyasi, qo'ng'iroq yozuvlari, davomat**
- UTEL va Мои звонки uchun ochiq API hujjat yo'qligi sababli, `CallProvider` pluggable adapter interfeysi (`verify_signature`+`parse_event`) o'ylab topilgan-lekin-real hayotga mos payload/signature sxemasi bilan quriladi — arxitektura asosiy narsa, real API hujjat kelganda faqat ichki mantiq almashtiriladi
- Webhook'lar sessiyasiz (`tenant_id` URL'dan, lekin haqiqiy autentifikatsiya — HMAC signature, shu tenant'ning shifrlangan sirridan tekshiriladi); noto'g'ri signature'li so'rovlar saqlanmaydi (DoS oldini olish)
- Qo'ng'iroq yozuvi (recording) yuklab olinib MinIO/S3'ga saqlanadi (`app/core/storage.py`), faqat short-lived presigned URL orqali eshittiriladi
- `webhook_events` — provider-agnostic idempotent ingestion jadvali, keyingi integratsiyalar (CRM, Telegram, Payme/Click) uchun ham qayta ishlatiladi
- Manager mapping — provider extension/agent ID'ni `users`ga bog'laydi, qo'ng'iroq kelganda `responsible_user_id` avtomatik aniqlanadi
- **Attendance** (alohida modul) — oddiy check-in/check-out, Face ID yo'q; o'z-o'ziga xizmat (permission kerak emas), boshqalarni ko'rish/push qilish uchun alohida permission

**Billing / Platform SaaS to'lovi (Faza 8)**
- Uchta qat'iy tarif rejasi (`starter`/`business`/`enterprise`), Platform Admin narx/limitlarni tahrirlaydi — `finance` (tenant ichidagi mijoz to'lovlari) bilan aralashtirilmagan, bu platformaning tenant'dan olgan SaaS to'lovi
- Click va Payme — Payme haqiqiy Merchant API (JSON-RPC) spesifikatsiyasiga mos, Click esa barqaror community hujjatlariga asoslangan (real sandbox ulanishida qayta tekshirilishi kerak); ikkalasi ham signature/idempotency bilan tekshiriladi, karta ma'lumoti saqlanmaydi
- Subscription holati (`trial`/`active`/`past_due`/`grace`/`suspended`/`cancelled`) `tenants.status`ning o'zida — muvaffaqiyatli to'lov va dunning-run shu holatni boshqaradi
- Storage limit — real PostgreSQL row-hajmi + object storage fayllari asosida hisoblanadi (on-demand, real cron emas), 80%/100%da ogohlantirish yuboriladi, moliyaviy operatsiyalar bloklanmaydi

**Notifications (Faza 9) — Telegram bot, PDF hisobot, retry/DLQ**
- Har bir tenant o'z Telegram botini ulaydi (token shifrlangan holda saqlanadi), kategoriya bo'yicha guruhga xabar yuboradi
- PDF hisobot (`reportlab` bilan) generatsiya qilinib, Telegram'ga hujjat sifatida yuboriladi
- **Loyihadagi birinchi haqiqiy background worker** — xabarlar navbati (`notification_outbox`) va alohida append-only delivery log (`notification_delivery_log`); muvaffaqiyatsiz urinish exponential backoff bilan qayta uriniladi, `max_retries`dan oshsa `dead_letter` holatiga o'tadi

**Analytics (Faza 10) — dashboard, Live Leaderboard, dashboard-only rol**
- Sotuvchilar reytingi (leaderboard), kategoriya/"kurs" bo'yicha sotuv statistikasi, umumiy dashboard xulosasi — barchasi valyuta bo'yicha guruhlangan (UZS/USD aralashtirilmaydi)
- **Live Leaderboard — Server-Sent Events orqali** (loyihadagi birinchi SSE), 5 soniyalik tsiklda yangilanadi
- **Dashboard-only rol** — alohida `dashboards` jadvali (email/parol emas, faqat nom+parol), uchinchi JWT audience (`dashboard_session`) orqali; har bir dashboard butun tenant statistikasini ko'radi, faqat boshqa dashboard'ning nomi/paroliga kira olmaydi

**Tashqi integratsiyalar (Faza 11) — AmoCRM/Bitrix24, Meta Ads**
- Ilgari bo'sh turgan `app/modules/crm/` moduli qurildi — `customers.crm_activities` (ichki eslatmalar jurnali)dan alohida, tashqi CRM sinxronizatsiyasi uchun
- AmoCRM va Bitrix24 — umumiy `CRMProvider` interfeysi (webhook qabul qilish + tashqi tizimga lead push qilish), OAuth'siz (Bitrix24 — faqat server-webhook, TZ ruxsat bergani uchun)
- Meta Ads — kampaniya va kunlik statistika (`daily insight`) uchun pull-only sinxronizatsiya, System User uzoq muddatli token bilan (OAuth yo'q), alohida background worker orqali (6 soatlik interval)
- Uchala integratsiya ham real API'larga qarshi sinaldi (soxta credential bilan ham haqiqiy, to'g'ri formatlangan xato javoblari qaytdi — so'rov shakli to'g'ri qurilganini tasdiqlaydi)

**Import/export va diagnostika (Faza 12)**
- Import qilinmadi (hech narsa iste'mol qilmaydi, spekulyativ bo'lardi) — faqat **export** (`customers`/`sales`/`finance`/`calls`, CSV+XLSX) va **diagnostika**
- `GET /reports/diagnostics` — 5 ta moliyaviy/operatsion tekshiruv: charge yozuvisiz sale, uzoq pending qolgan adjustment_request, manfiy balansli sale, unprocessed webhook_events, notification_outbox backlog
- `reports.view`/`reports.export` — TZ'ning "faqat ruxsatli adminlarga" talabi bo'yicha faqat `admin` roliga beriladi (boshqa rollarga default berilmaydi); `reports.export` 2FA talab qiladi (bulk export — data-exfiltration xavfi)

**Xavfsizlik hardening (birinchi bosqich, 2026-07-09)**
- **Brute-force himoyasi**: `users`/`platform_admins`/`dashboards` — 5 ta ketma-ket xato urinishdan keyin 15 daqiqaga account lock, atomic increment (race condition yo'q)
- Timing-based account enumeration'ga qarshi himoya (dummy bcrypt verify), token/kod solishtirishlar constant-time (`hmac.compare_digest`)
- Per-IP rate limiting (login/OTP/webhook endpoint'lar), security headers middleware, CORS (default o'chiq, wildcard hech qachon ishlatilmaydi)
- Jarayonda **eski, jiddiy bug topildi**: tranzaksiya ichida exception otish counter increment'ni rollback qilar ekan — OTP'ning `otp_max_attempts` himoyasi Faza 1'dan beri jimgina ishlamas edi, shu safar tuzatildi

**Partitioning (Faza 13, birinchi qism)**
- `ledger_entries`/`calls`/`webhook_events` oylik `PARTITION BY RANGE` ga o'tkazildi (`audit_logs` Faza 2'dan beri partitioned edi)
- `webhook_events`'ning `created_at`'i server tomonida generatsiya qilingani sababli uni partition-key + idempotency-key sifatida ishlatish retry'larni butunlay buzardi — buning o'rniga alohida, kichik, partition qilinmagan `webhook_event_dedup` jadvali haqiqiy idempotency gate bo'lib xizmat qiladi
- Har bir jadvalga `DEFAULT` partition qo'shildi (xavfsizlik to'ri)

**Staging deploy (2026-07-09)**
- Loyiha shared VPS'da jonli (`89.43.33.8:8001`) — boshqa (bog'liq bo'lmagan) loyihaga tegmagan holda, alohida systemd servis, alohida Postgres role/baza bilan. Batafsil — `CLAUDE.md`ning **Deployment** bo'limi

### ❌ Hali qilinmagan

- **Infra/performance (Faza 13'ning qolgan qismi)** — PostgreSQL Primary+Standby replikatsiya, WAL/S3 backup, real load test (5000 sessiya/1000 rps), CI pipeline — bularning barchasi maxsus/qo'shimcha VPS talab qiladi, staging server (2 vCPU/3.8GB, boshqa loyiha bilan bo'lishilgan) bunga mos emas
- **Partition avtomatlashtirish** — `audit_logs` (va endi boshqa uchta jadval) uchun oylik partition auto-create (Faza 14)
- **AI yordamchi** — feature flag sifatida rejalashtirilgan, hali yo'q, launch uchun majburiy emas
- **Avtomatik test suite** — hali yo'q, har bir faza qo'lda smoke-test qilingan
- To'liq xavfsizlik audit (AmoCRM query-param secret, CI/CVE scanning, dev-only accountlarni tozalash) — barcha faza tugagach rejalashtirilgan

## Backend qanchalik tayyor

TZ'ning 14 fazasidan **11 tasi to'liq**, **1 tasi qisman** (Faza 13 — partitioning va staging deploy bajarilgan, replikatsiya/backup/load-test/CI qolgan) bajarilgan; qolgan 2 tasi (Faza 14 — partition avtomatlashtirish, va AI yordamchi) hali boshlanmagan. Ya'ni **asosiy mahsulot mantig'i (auth → RBAC → catalog → CRM → sales → finance → calls → billing → notifications → analytics → tashqi integratsiyalar → export/diagnostika) to'liq ishlab turibdi va real serverda sinalgan**; qolgan ish — infratuzilma (yuqori mavjudlik, backup, CI) va launch uchun majburiy bo'lmagan qo'shimchalar.

## API tuzilishi

Barcha tenant-facing endpoint'lar `/api/v1/...` ostida (JWT bilan himoyalangan, `Authorization: Bearer <token>`), platform-darajasidagi endpoint'lar `/platform/v1/...` ostida (alohida Platform Admin JWT). To'liq OpenAPI hujjat `/docs`da avtomatik generatsiya qilinadi.

| Prefix | Auth | Nima uchun xizmat qiladi |
|---|---|---|
| `/api/v1/auth` | ochiq (login/register/OTP/reset) yoki JWT | Self-service ro'yxatdan o'tish, login (identifier), refresh/logout, telefon OTP, parolni tiklash, opt-in 2FA setup/tasdiqlash |
| `/api/v1/users` | JWT, `users.view`/`users.manage` | Tenant Admin uchun foydalanuvchi CRUD, rol biriktirish |
| `/api/v1/roles`, `/api/v1/permissions` | JWT, `roles.view`/`roles.manage` | Rol yaratish/tahrirlash, permission katalogini ko'rish |
| `/api/v1/catalog/categories` | JWT, `catalog.view`/`catalog.manage` | Mahsulot/xizmat ierarxiyasi (cheksiz chuqurlik, masalan Telefon→S25→Qora→512GB) |
| `/api/v1/customers` | JWT, `customers.view`/`customers.manage` | Mijozlar/leadlar, lead stage, CRM tarixi (eslatma/qo'ng'iroq/email) |
| `/api/v1/sales` | JWT, `sales.view`/`sales.manage` | Savdo shartnomalari, narx/muddat/holat, o'zgarishlar tarixi |
| `/api/v1/finance` | JWT, `finance.view`/`finance.manage`/`finance.approve` | To'lovlar, ledger, refund/tarif-almashtirish approval, bonus/payroll |
| `/api/v1/calls` | JWT (`calls.view`/`calls.manage`) + webhook (HMAC signature) | UTEL/Мои звонки integratsiyasi, qo'ng'iroq yozuvlari, manager mapping |
| `/api/v1/attendance` | JWT (o'z-o'ziga — permissionsiz; boshqalar uchun `attendance.view`/`attendance.manage`) | Davomat check-in/check-out |
| `/api/v1/billing` + `/api/v1/billing/webhooks` | JWT (`billing.view`/`billing.manage`) + Click/Payme signature | Tenant'ning SaaS obunasi, Click/Payme to'lovlari, storage limit |
| `/api/v1/notifications` | JWT, `notifications.view`/`notifications.manage` | Telegram bot ulash, guruh xabarlari, PDF hisobot, delivery log |
| `/api/v1/analytics` | JWT, `analytics.view`/`analytics.manage` | Dashboard xulosasi, seller leaderboard (shu jumladan SSE stream), course sales |
| `/api/v1/dashboard-sessions` | Dashboard nom+parol (alohida JWT audience) | Kiosk-rejim Live Leaderboard — email/parolsiz, faqat o'z nomiga kira oladi |
| `/api/v1/crm` | JWT (`crm.view`/`crm.manage`) + webhook | AmoCRM/Bitrix24/Meta Ads tashqi integratsiya, lead sync tarixi |
| `/api/v1/reports` | JWT, `reports.view`/`reports.export` (faqat admin) | Moliyaviy/operatsion diagnostika, CSV/XLSX bulk export |
| `/platform/v1` | Platform Admin JWT | Tenant yaratish/ro'yxat, SaaS tarif boshqaruvi, audit log |

## Ishga tushirish

Batafsil buyruqlar va arxitektura qoidalari uchun `CLAUDE.md`ga qarang. Qisqacha:

```
.venv\Scripts\activate
docker compose up -d postgres minio
python -m app.db.migrate
uvicorn app.main:app --reload
```

MinIO birinchi marta ishga tushganda `OBJECT_STORAGE_BUCKET` (`.env`dagi) bucket'ini bir marta yaratish kerak (MinIO konsoli `http://localhost:9001` yoki `boto3`/`mc` orqali) — ilova buni o'zi yaratmaydi.

API `http://127.0.0.1:8000` da ishga tushadi, interaktiv hujjat `http://127.0.0.1:8000/docs`da. Misol so'rovlar uchun `test_main.http`.

Staging deploy holati va production'ga tayyorlash bo'yicha — `CLAUDE.md`ning **Deployment** bo'limiga qarang.
