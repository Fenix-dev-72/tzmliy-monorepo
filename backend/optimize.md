# Performance optimizatsiya reja va holati

Ushbu fayl backend'dagi tezlikka ta'sir qiluvchi omillar bo'yicha audit natijasi va bajarilish tartibini hujjatlashtiradi. Har bir band bajarilgach shu yerda "✅ Bajarildi" deb belgilanadi va qisqacha nima qilinganini yozib qo'yiladi — kelgusi sessiyalarda qayta boshidan tekshirmaslik uchun.

## ✅ Bajarilgan (2026-07-12)

### 1. Payroll hisoblashdagi N+1 so'rov muammosi
- **Muammo edi**: `calculate_payroll` har bir foydalanuvchi uchun alohida 3 ta so'rov + valyuta boshiga alohida upsert qilardi — 100 xodim uchun ~500 ta DB round-trip.
- **Tuzatildi**: `_run_payroll_calculation` (`app/modules/finance/service.py`) endi foydalanuvchi sonidan qat'i nazar **5 ta so'rov** bilan ishlaydi — bulk role/bonus-plan/payments so'rovlari + bitta ko'p-qatorli `unnest()` upsert.
- **Background job**: `POST /finance/payroll/calculate` endi sinxron emas — `payroll_calculation_jobs` jadvali + `payroll_worker.py` (background worker) orqali ishlaydi. `202 Accepted` qaytaradi, frontend job holatini poll qiladi.

### 2. `sales` jadvalida yetishmayotgan indekslar
- **Muammo edi**: `sales.created_at` ustunida indeks yo'q edi — profit summary, analytics leaderboard, diagnostika har safar to'liq jadval skanerini qilardi.
- **Tuzatildi**: Migratsiya `0026_performance_indexes.sql` — `sales(tenant_id, created_at)`, `sale_payments(tenant_id, created_at)`, `ledger_entries(tenant_id, sale_id, currency)` indekslari qo'shildi.

### 3. Excel/CSV export event loop'ni bloklashi
- **Muammo edi**: `GET /reports/export/{entity}` butun jadvalni sinxron o'qib, `openpyxl` bilan faylni **event loop ichida** qurar edi — katta export butun serverni bir lahzaga to'xtatib qo'yishi mumkin edi.
- **Tuzatildi**: `report_export_jobs` jadvali + `export_worker.py` (background worker). `POST /reports/export/{entity}` endi `202 Accepted` qaytaradi, fayl tayyor bo'lgach presigned S3 link orqali yuklab olinadi.
- **Eslatma**: hozircha object storage (S3/MinIO) VPS'da sozlanmagan — job to'g'ri `failed` holatiga o'tadi (`InvalidAccessKeyId`), worker qulamaydi. Real ishlashi uchun S3 kredensiallari kerak.

### 4. OTP/kod yuborish request'ni bloklashi
- **Muammo edi**: Har bir ro'yxatdan o'tish/login-OTP/parol-tiklash so'rovi SMTP/Telegram javobini **1-2 soniya kutib** turardi.
- **Tuzatildi**: Celery + Redis (broker, alohida DB index 2) orqali fon jarayoniga o'tkazildi. Yangi `dashboarduz-celery.service` systemd xizmati. So'rov endi ~50-100ms'da tugaydi.

### 5. Pagination (sahifalash)
- **Muammo edi**: `list_customers`, `list_sales`, `list_calls`, `list_bonus_plans`, `list_payroll_entries` — barchasi cheksiz natija qaytarardi.
- **Tuzatildi**: 5 ta endpoint'ga `limit`/`offset` (default 50, max 200) qo'shildi. Frontend'da 4 ta sahifaga "Ko'proq yuklash" tugmasi qo'shildi.
- **Yon-effekt tuzatildi**: `SalesPage.tsx`'dagi mijoz-tanlash dropdown'i (`listCustomers`dan alohida foydalanish holati) `limit=200` bilan aniq belgilandi — standart 50 unga noto'g'ri ta'sir qilishining oldi olindi.

## ✅ Bajarilgan (2026-07-14)

### 6. `get_negative_balance_sales`'ga sana filtri qo'shish
- **Tuzatildi**: `reports/sql/queries.sql`'dagi so'rovga ixtiyoriy `:period_start::timestamptz` filtri qo'shildi (partition-key ustuniga, ya'ni partition pruning ham ishlaydi). `reports/service.py`'ning `get_diagnostics` funksiyasi standart holatda oxirgi 90 kunni tekshiradi (`DEFAULT_DIAGNOSTICS_LOOKBACK_DAYS`), `GET /reports/diagnostics?period_start=...` orqali boshqa/to'liq tarixni so'rash mumkin.

### 7. Diagnostika endpoint'ini parallellashtirish
- **Tuzatildi**: `get_diagnostics`dagi 5 ta tekshiruv endi `asyncio.gather()` bilan bir vaqtda ishga tushadi — har biri **o'z alohida** `tenant_connection`'ida (bitta ulanishni parallel so'rovlar orasida bo'lishish asyncpg'da xato beradi, shuning uchun har bir tekshiruv o'z connection'ini oladi).

### 8. Notifications/CRM worker'larni parallellashtirish
- **Notifications tomoni**: bugungi Celery migratsiyasi bilan avtomatik hal bo'ldi — `dispatch_due_outbox`/`dispatch_due_schedules` endi har tenant/xabar uchun alohida Celery task sifatida `.delay()` qiladi (ketma-ket kutish yo'q).
- **CRM worker**: `crm/worker.py`'ning `sync_meta_ads` funksiyasi endi tenantlarni `asyncio.gather()` + semaphore (`crm_sync_max_concurrency`, standart 10) bilan bir vaqtda sinxronlaydi, ketma-ket `for` loop o'rniga. Yon-effekt sifatida har tenant endi alohida try/except bilan izolyatsiya qilingan (avval bitta tenant xatosi o'sha tick'dagi qolgan tenantlarni ham to'xtatib qo'yardi).

### 9. Billing storage hisoblashni yengillashtirish
- **Tuzatildi**: `recalculate_storage` endi so'nggi snapshot `billing_storage_recalc_cache_minutes` (standart 60 daqiqa) dan yangi bo'lsa, qimmat `compute_tenant_db_bytes` skanerini qayta ishga tushirmay, keshlangan natijani qaytaradi. `POST .../storage/recalculate?force=true` bilan majburiy qayta hisoblash mumkin.

### 10. Webhook'dagi sinxron recording yuklashni background'ga o'tkazish
- **Tuzatildi**: `calls.pending_recording_url` + `recording_download_attempts` ustunlari qo'shildi (`0036_calls_pending_recording.sql`). `ingest_webhook` endi yozuvni darhol yuklamaydi — faqat URL'ni yozib qo'yadi. Yangi `calls/recording_worker.py` (oltinchi mustaqil `asyncio.create_task` worker, boshqalar bilan bir xil konvensiya) haqiqiy yuklab-olish/yuklashni fonda bajaradi, `calls_recording_max_attempts` (standart 5) muvaffaqiyatsizlikdan keyin butunlay voz kechadi.

### 11. Rate-limiter'ni Redis'ga o'tkazish
- **Tuzatildi**: `core/middleware.py`'dagi `SlidingWindowLimiter` xotiradagi `deque` o'rniga Redis ZSET (sliding-window-log, `app.state.redis`'ning mavjud ulanishidan foydalanadi) orqali ishlaydi — endi bir nechta app-process/VPS bo'ylab ham to'g'ri hisoblanadi, har processda alohida emas.

## ✅ Bajarilgan (2026-07-17)

### 12. Frontend bundle -- route-based code splitting
- **Muammo edi**: `router.tsx` barcha sahifalarni (Sales, Finance, Reports, butun Platform Admin konsoli va h.k.) eager import qilardi -- birinchi yuklanishda foydalanuvchi faqat bitta sahifani ochsa ham ~1.15 MB (siqilmagan) JS fayli yuklanardi.
- **Tuzatildi**: `react-router` 7'ning o'zining `lazy` route xususiyati orqali har bir sahifa alohida chunk'ga bo'lindi -- faqat o'sha route birinchi marta ochilganda yuklanadi. Bosh sahifa endi ~360 KB (110 KB siqilgan) bilan ochiladi. Faqat doim kerak bo'ladigan qobiqlar (LandingPage, uchta layout, NotFound) eager qoldirildi.

### 13. CRM lidlar oqimi (SSE) -- cheksiz o'sish
- **Muammo edi**: `IntegrationsPage`'ning "Lidlar tarixi" oqimi har 5 soniyada butun `crm_lead_syncs` tarixini qayta yuborardi -- tenant qancha ko'p lid sinxronlasa, shuncha og'irlashadi.
- **Tuzatildi**: `list_crm_lead_syncs` so'nggi 100 qator bilan cheklandi (`LIMIT 100`) + `crm_lead_syncs(tenant_id, synced_at DESC)` indeksi qo'shildi (`0044_performance_indexes_2.sql`).

### 14. Bildirishnomalar, davomat, moliyaviy tuzatish so'rovlari -- cheksiz ro'yxatlar
- **Tuzatildi**: `list_outbox_for_tenant`/`list_delivery_log` (`LIMIT 200` + indeks), `list_attendance` (`LIMIT 500`), `list_adjustment_requests` (`LIMIT 200`, eng yangisi birinchi bo'ladigan qilib `ORDER BY created_at DESC`ga o'zgartirildi).

### 15. Rate-limiter -- umumiy API cheklovi qo'shildi
- **Tuzatildi**: `#11`dagi Redis-asoslangan limiter'ga uchinchi, umumiy bucket qo'shildi -- login/webhook'dan tashqari **har qanday** `/api/v1`/`/platform/v1` yo'li endi ham cheklanadi (`rate_limit_general_requests`, standart 300/daqiqa/IP). Sabab: haqiqiy (yoki o'g'irlangan) JWT bilan ham biznes endpoint'larni to'ldirib tashlash mumkin edi -- faqat login limiteri buni to'xtatolmaydi.

### 16. Mahsulot rasmlari -- WebP'ga avtomatik o'tkazish
- **Tuzatildi**: `products/service.py`'ning `upload_photo`'si endi har qanday yuklangan JPEG/PNG/WEBP'ni Pillow orqali WebP formatiga o'tkazadi (sifat=82, uzun tomoni 1600px'dan katta bo'lsa kichraytiriladi) -- object storage hajmi va tarmoq trafigi sezilarli kamayadi (test namunada ~70% kichrayish).

## ✅ Bajarilgan (2026-07-18)

### 17. `get_revenue_timeseries` -- endi SQL'da guruhlanadi
- **Tuzatildi**: `analytics/sql/queries.sql`'da `get_sales_timeseries_buckets`/`get_collected_timeseries_buckets` qo'shildi -- `date_trunc(:unit, created_at AT TIME ZONE 'Asia/Tashkent')` + `GROUP BY (bucket_start, currency)`, xom qator tortish butunlay yo'q qilindi. `analytics/service.py`'dagi `get_revenue_timeseries` endi faqat allaqachon-guruhlangan (bucket, currency, summa) qatorlarni oladi; `_bucket_index` (Python'da har qator uchun guruh topish funksiyasi) endi kerak emas, o'chirildi.

### 18. Hisobotlar diagnostikasi -- sana chegarasi + LIMIT qo'shildi
- **Tuzatildi**: `get_sales_without_charge_entry` endi `get_negative_balance_sales`dagi kabi `period_start` filtri va `LIMIT 500` oladi (avval butun `sales` jadvalini cheklovsiz skanerlagan). `get_negative_balance_sales`ga ham `LIMIT 500` qo'shildi.

### 19. `subscription_payments` -- LIMIT + indeks qo'shildi
- **Tuzatildi**: `list_subscription_payments`ga `LIMIT 200` qo'shildi, yangi `0045_performance_indexes_3.sql` migratsiyasi `(tenant_id, created_at DESC)` indeksini qo'shdi.

### 20. Notifications va Billing fon jarayonlari -- parallellashtirildi
- **Tuzatildi**: `notifications/tasks.py`'ning outbox/schedule dispatch funksiyalari va `billing/service.py`'ning `run_dunning`'i endi `crm/worker.py`'ning `sync_meta_ads`idagi bilan bir xil naqsh bo'yicha -- semaphore bilan chegaralangan `asyncio.gather` orqali -- har tenant uchun parallel ishlaydi (yangi umumiy `Settings.tenant_loop_max_concurrency` sozlamasi, standart 10).

### 21. `crm/worker.py`'dagi N+1 so'rov tuzatildi
- **Tuzatildi**: `_sync_tenant_amocrm_calls` endi har qo'ng'iroq uchun alohida so'rov yubormaydi -- tenant uchun barcha AmoCRM manager bog'lanishlari bir marta bulk o'qiladi (`list_crm_manager_mappings`) va lug'atda (dict) qidiriladi.

### 22. Kichikroq cheksiz ro'yxatlarga LIMIT qo'shildi
- **Tuzatildi**: `list_ad_insights` (`LIMIT 365`), `list_customer_activities` (`LIMIT 300`, `DESC`ga o'zgartirildi), `list_sale_changes` (`LIMIT 300`, `DESC`ga o'zgartirildi).

### 24. DB ulanish puli oshirildi
- **Tuzatildi**: `db_pool_min_size` 2'dan 4'ga, `db_pool_max_size` 10'dan 20'ga oshirildi (hozirgi umumiy VPS uchun ehtiyotkorona qadam -- katta serverga o'tishda yana oshirilishi kerak).

### 25. API javoblari endi siqiladi (gzip)
- **Tuzatildi**: `main.py`'ga Starlette'ning `GZipMiddleware`'i qo'shildi (`minimum_size=1000`) -- katta JSON ro'yxatlar endi siqilgan holda yuboriladi. SSE oqimlariga ta'sir qilmaydi (Starlette gzip'ni `text/event-stream` uchun avtomatik o'chiradi).

### 27. SSE uchun tenant-boshiga Redis keshi (cache-aside)
- **Tuzatildi**: `analytics/router.py`'ning `_leaderboard_event_source`i va `crm/router.py`'ning `_lead_sync_event_source`i endi har tikda to'g'ridan-to'g'ri DB'ga so'rov yubormaydi -- Redis'da tenant-boshiga keshlangan natijani o'qiydi (`sse_cache:leaderboard:{tenant_id}` / `sse_cache:crm_leads:{tenant_id}`, TTL = `analytics_sse_poll_seconds`). Bitta tenant'ning bir nechta ochiq tab/dashboard ulanishidan faqat birinchisi (kesh eskirgan/yo'q bo'lganda) haqiqiy DB so'rovini yuboradi, qolganlari xuddi shu keshlangan natijani qayta ishlatadi -- DB yukini ulanishlar soniga ko'paytirish o'rniga taxminan bitta so'rovga tushiradi. Cache-aside (fon jarayoni emas) tanlandi -- faqat kimdir kuzatib turgan tenant'lar uchun hisoblanadi, hech kim ochmagan tenant'lar uchun bekorga ishlamaydi.

## ✅ Bajarilgan (2026-07-18, xavfsizlik)

### 23. Xavfsizlik -- 2026-07-17 auditida topilgan 5 ta muammo
Tezlik emas, xavfsizlik/to'g'rilik masalalari edi -- barchasi tuzatildi:
- **`reverse_payment` `net_collected`ga ta'sir qilmasligi**: `get_net_collected_by_sale` faqat `payment`/`refund` ledger yozuvlarini hisoblardi, `reverse_payment`ning `adjustment` yozuvini emas -- bekor qilingan to'lov hali ham "to'liq yig'ilgan" deb hisoblanardi, refund so'rovi haqiqatda ushlab turilgan summadan oshib ketishi mumkin edi. `entry_type IN (...)`ga `'adjustment'` qo'shildi.
- **`record_payment`dagi race condition**: bir vaqtda kelgan ikkita to'lov so'rovi bir xil balansni o'qib, ikkalasi ham "yetarli" deb topilib, balansdan oshib ketishi mumkin edi (lock yo'q edi). Endi sotuv qatori `FOR UPDATE` bilan qulflanadi (`get_sale_summary_for_update`) -- ikkinchi so'rov birinchisi tugagunicha kutadi.
- **Webhook maxfiy kaliti `calls.view`ga ochiq edi**: `GET /calls/integrations/{provider}/webhook-url` shifrlanmagan `webhook_secret`ni qaytaradi, lekin faqat o'qish huquqi (`CALLS_VIEW`) bilan ham ko'rish mumkin edi. `CALLS_MANAGE`ga o'zgartirildi.
- **CORS**: tekshirilganda VPS'da allaqachon `CORS_ALLOWED_ORIGINS=https://tizimly.duckdns.org` ekan (ilgari `*` edi, biroq boshqa sozlash bosqichida allaqachon tuzatilgan) -- jonli tekshiruv bilan tasdiqlandi: begona domendan so'rov 400 "Disallowed CORS origin" oladi, haqiqiy domendan esa to'g'ri CORS header qaytadi.
- **UTEL `call_ended`ning "takror" deb tashlab yuborilishi**: `call_started` va `call_ended` bir xil `call_id`ga ega bo'lgani uchun, `event_id` maydoni yo'q bo'lganda ikkalasi bir xil `external_event_id`ga tushib, ikkinchisi (haqiqiy davomiylik/yozuv bilan keladigani) dublikat sifatida rad etilardi. Endi `call_id`ga `:started`/`:ended` qo'shiladi. Bundan tashqari, `insert_call`ning o'zi ham faqat `DO NOTHING` edi -- hatto ID muammosi tuzatilgandan keyin ham, `call_ended` voqeasi allaqachon mavjud qatorni yangilamasdi. Endi `DO UPDATE ... WHERE EXCLUDED.ended_at IS NOT NULL AND calls.ended_at IS NULL` bilan xavfsiz birlashtiriladi.

## 🔲 Rejalashtirilgan

### 26. Bitta uvicorn worker
- **Muammo**: Production hozir `uvicorn app.main:app --workers 1` bilan ishga tushiriladi (kichik, umumiy 2 vCPU VPS uchun mantiqiy edi) -- bitta jarayon faqat bitta protsessor yadrosini samarali ishlatadi.
- **Reja**: Katta/yangi serverga o'tishda `--workers`ni yadrolar soniga mos oshirish (masalan 4-8) -- bu kod o'zgarishi emas, joylashtirish (systemd unit) sozlamasi.

---

## Eslatma

Bu fayl `CLAUDE.md`ning "Performance hardening pass" bo'limlariga to'liq mos keladi (batafsil texnik izoh va kod ma'lumotnomalari o'sha yerda) — bu yerda faqat qisqa, ketma-ket ro'yxat sifatida saqlanadi, tez ko'z tashlash uchun.
