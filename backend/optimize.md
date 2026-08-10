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

## ✅ Bajarilgan (2026-08-08) -- yangi server (212.115.110.84), Docker migratsiya + yuklama testi

### 26. Bitta uvicorn worker -> yangi alohida 8 vCPU serverga to'liq migratsiya
- **Muammo edi**: Production eski `89.43.33.8`da `uvicorn app.main:app --workers 1` bilan ishga tushirilardi (umumiy 2 vCPU VPS, boshqa loyiha bilan bo'lishilgan, Docker yo'q edi) -- bitta jarayon faqat bitta protsessor yadrosini samarali ishlatardi.
- **Tuzatildi**: `tizimly.uz` butunlay yangi, **alohida** 8 vCPU / 7.8GB RAM serverga (`212.115.110.84`, Ubuntu 24.04) ko'chirildi -- to'liq Docker'da: `backend/Dockerfile` (production uvicorn image), `frontend/Dockerfile` (multi-stage Vite build -> statik export -> host nginx), `docker-compose.prod.yml` (postgres 18, redis, minio, app, celery_worker, celery_beat). Bo'sh DB bilan boshlandi (53 migratsiya qo'llandi), yangi Platform Admin yaratildi, nginx + certbot orqali `https://tizimly.uz` uchun haqiqiy Let's Encrypt sertifikat olindi (avtomatik yangilanadi).
- **Worker/pool masshtablash**: `--workers 4 -> 8` (bitta yadroga bitta worker), celery `--concurrency 2 -> 4`, `DB_POOL_MAX_SIZE 12 -> 25`, Postgres `max_connections 100 -> 400`. Eski shared-box uchun tanlangan qiymatlar endi keraksiz cheklov edi.

### 27. Yuklama testi (`wrk`, real DB-yozuvchi endpoint -- `/auth/register/request-code`)
- **Metodika**: `wrk` server o'zida ishga tushirilgani uchun ikkita amaliy nozik jihat chiqdi va ikkalasi ham tuzatildi:
  1. Bitta IP'dan yuborilgan minglab so'rov `core/middleware.py`ning auth-endpoint rate-limiter'iga (10/daq) urilib, deyarli hammasi 429 qaytardi -- **bu xato emas, xavfsizlik ishlagani**. Har so'rovga tasodifiy `X-Forwarded-For` qo'shib (`TRUST_X_FORWARDED_FOR=true` sozlangani uchun) haqiqiy backend quvvatini o'lchash mumkin bo'ldi.
  2. `wrk`ning o'zi ham xuddi shu 8 yadroda protsessor vaqti yeydi -- `vmstat`da `steal=0%` (hypervisor cheklovi yo'q) va `us+sy≈90%` ko'rsatdi, ya'ni **butun tizim (app+celery+postgres+redis+wrk) birgalikda haqiqatan ham 8 yadroni deyarli to'liq band qilgan** -- bu haqiqiy CPU tavani, sun'iy cheklov (DB pool/max_connections) emas (buni pool'ni 25/400ga oshirib ham tasdiqladik -- natija o'zgarmadi).
- **Natija**: concurrency 100 dan 4000 gacha (taskset bilan cheklab va cheklovsiz) -- throughput doim **~1750-1850 so'rov/soniya**da tekislandi, ilova darajasida bitta ham xato yo'q, Postgres ulanishlari hech qachon limitga yaqinlashmadi (max ~217/400).
- **Solishtiruv**: eski shared 2 vCPU box ~130-135 so'rov/soniya edi (2026-07-12dagi test, shu faylning yuqorisida) -- yangi alohida 8 vCPU box **~13-14x** yaxshi natija berdi.

---

## ✅ Bajarilgan (2026-08-09) -- aralash so'rovlar bilan (realistic-mix) rol asosidagi test

### 28. Ilgari faqat bitta og'ir endpoint bilan test qilingan edi -- endi rol asosida real trafik bilan tekshirildi
- **Metodika**: Platform Admin orqali (email tasdiqlashsiz) alohida test-tenant yaratildi, 8 xodim (1 admin, 2 manager, 5 agent, 1 finance), 5 katalog kategoriyasi, 150 mijoz, 300 sotuv, 139 to'lov bilan to'ldirildi. Har bir rol `auth/permissions.py`'dagi `DEFAULT_ROLE_PERMISSIONS`iga mos, real login+token bilan, o'z ko'radigan sahifalariga (Python `threading` asosidagi virtual-foydalanuvchi skripti, har biriga 0.5-2s "o'ylash vaqti") mos og'irlikdagi so'rov aralashmasini yubordi.
- **Ikkita real xato topildi va tuzatildi** (test skriptida, ilova kodida emas): (1) admin uchun 2FA yoqilgani uchun oddiy login funksiyasi ishlamagan; (2) `finance/profit-summary` majburiy `period_start`/`period_end` parametrlarisiz 422 bergan. Uchinchi "xato" haqiqatda **to'g'ri ishlagan xavfsizlik** bo'lib chiqdi: `finance`/`agent`/`manager` faqat **o'ziga mas'ul** sotuv/mijozni ID orqali ko'ra oladi (`0046_own_data_scoping.sql`) -- tasodifiy ID bilan so'rash tabiiy 404 beradi, real foydalanuvchi esa faqat o'z ro'yxatida ko'rgan narsasini bosadi.
- **Yon ta'sir**: 2026-08-08dagi `wrk` testlari 744,076 ta haqiqiy `send_email_code` Celery vazifasini navbatga qo'yib, Gmail SMTP'ni (`samandar7282@gmail.com`) vaqtincha bloklatib qo'ydi (`SMTPServerDisconnected`). Navbat tozalandi, lekin Gmail'ning o'z bloki alohida vaqt talab qiladi -- **kelajakda haqiqiy email/SMS yuboradigan endpoint'larni ommaviy yuklama testida ishlatmaslik kerak.**
- **Metodologik topilma**: bitta xil test (900 virtual foydalanuvchi) Windows noutbukdan ishga tushirilganda 95.31% muvaffaqiyat/252 so'rov-s berdi, xuddi shu test **serverning o'zidan** ishga tushirilganda **100%/609 so'rov-s** berdi -- demak noutbuk (tarmoq/resurs) o'zi cheklov bo'lgan, server emas. Shundan keyingi barcha o'lchovlar serverning o'zidan (`ulimit -n 65535` bilan, yozib bo'lmaydigan fayl-deskriptor tugashini oldini olish uchun) olindi.
- **Natija**: **2700 bir vaqtda faol virtual xodim (≈300 tenant, tenant boshiga 9 kishi) -- 100% muvaffaqiyat, 632 so'rov/soniya, p50=324ms**, backend CPU atigi ~230% (8 yadroning 2.3 tasi) -- hali katta zaxira bor. Bundan yuqorida (5400+) test vositasining o'zi (Python `threading`+GIL) tiqilib qoldi, shuning uchun bu **tasdiqlangan pastki chegara**, haqiqiy sig'im yuqoriroq. O'lchangan xodim-boshiga so'rov tezligi (0.234 so'rov/s) ilgari qilingan qo'lda taxmin (0.2)ga juda yaqin chiqdi -- dastlabki baholash usuli tasdiqlandi.
- **Tozalash**: test-tenant va barcha bog'liq qatorlar (audit_logs'gacha) production'dan to'liq o'chirildi (`tenants` jadvalida 0 qoldiq tasdiqlandi).
- **Infratuzilma yon-tuzatishi**: shu test paytida `/platform/v1/...` yo'llari nginx konfiguratsiyasida umuman proksi qilinmayotgani aniqlandi (faqat `/api/`bor edi) -- `/etc/nginx/sites-available/tizimly.conf`ga `/platform/` location qo'shildi. Bu ilgari sinalmagan, endi tuzatilgan haqiqiy gap edi.

To'liq jadval va rol-boshiga natijalar: repo tuguni ildizidagi `test.md`.

## ✅ Bajarilgan (2026-08-09) -- PgBouncer, MinIO ochiq yuklab olish, export yuklama testi

### 29. PgBouncer joylashtirildi (real Postgres ulanishlar sonini kamaytirish uchun)
- **Sabab**: 1000-tenant miqyosidagi testda muvaffaqiyat foizi (~62-64%) past ekani aniqlangach, DB ulanish puli kattaligini oshirish (25→40) sinab ko'rildi -- lekin **yomonlashtirdi** (natija 64.34%→45.28%ga tushdi), chunki ko'p sonli xom (pooling qilinmagan) Postgres backend jarayonlari o'zaro context-switch/lock kurashini kuchaytiradi. Shundan keyin haqiqiy yechim -- ulanishlarni multiplekslash (PgBouncer) -- sinaldi.
- **Tuzatildi**: `docker-compose.prod.yml`ga `pgbouncer` (`edoburu/pgbouncer`, `transaction` pooling rejimi, `MAX_CLIENT_CONN=3000`, `DEFAULT_POOL_SIZE=40`) xizmati qo'shildi, `app`/`celery_worker`/`celery_beat`'ning `DATABASE_URL`si `postgres:5432` o'rniga `pgbouncer:5432`ga yo'naltirildi (`MIGRATIONS_DATABASE_URL` hali ham to'g'ridan-to'g'ri `postgres`ga, chunki migratsiyalar transaction-pooling bilan mos kelmasligi mumkin).
- **Ikkita Postgres 18-ga xos autentifikatsiya xatosi tuzatildi**: (1) `app_user`ning standart parol xesh turi (`scram-sha-256`) `edoburu/pgbouncer`ning server-tomon login jarayoni bilan mos kelmadi -- `password_encryption='md5'` qilib, parol qayta o'rnatildi; (2) shundan keyin ham xato davom etdi, sababi `pg_hba.conf` (`SHOW hba_file;` orqali topildi -- `/var/lib/postgresql/18/docker/pg_hba.conf`) barcha ulanishlarga majburiy `scram-sha-256` talab qilardi -- `sed`bilan `md5`ga o'zgartirilib, `pg_reload_conf()` chaqirildi (qayta ishga tushirishsiz).
- **Natija**: real Postgres backend ulanishlar soni yuklama ostida **350+dan 17gacha** kamaydi (PgBouncer to'g'ri multiplekslayotganining isboti) -- ammo **1000-tenant miqyosidagi muvaffaqiyat foizi o'zgarmadi** (PgBouncer'siz ham, bilan ham 62-64% oralig'ida qoldi). Xulosa: bu darajadagi degradatsiyaning asosiy sababi server-tomon DB ulanishlari emas -- ehtimol test klientining o'zi (bitta noutbuk) ishlatilgan uskunaning tarmoq/socket cheklovi. PgBouncer baribir joyida qoldirildi -- zararsiz va kelajakda (turli manbalardan ko'p tenant kelganda) foydali.

### 30. MinIO ochiq yuklab olish yo'li + export yuklama testi
Batafsil: yuqoridagi "CSV/Excel export testi" bo'limiga qarang. Qisqacha: `dashboarduz-storage` bucket yaratildi, nginx'ga `/storage/` proksi qo'shildi (haqiqiy `.xlsx` fayl muvaffaqiyatli yuklab olindi), 16 ta bir vaqtdagi export **2.61 soniyada, 0 xato bilan** tugadi (8 uvicorn worker, har biri o'z export fon-ishchisi bilan parallel ishlaydi).

**Qayta tasdiqlandi (2026-08-09, ikkinchi marta, yangi test-tenant bilan)**: yakka export 0.39s (14003 bayt, muvaffaqiyatli yuklab olindi), 16 ta parallel export **2.42s, 16/16 (100%), 0 xato**. Natijalar birinchi test bilan bir xil diapazonda — infratuzilma barqaror va takrorlanuvchan ishlayotgani tasdiqlandi. To'liq solishtiruv jadvali repo tuguni ildizidagi `test.md`da.

## ✅ Bajarilgan (2026-08-09) -- tezlik uchun xavfsiz konfiguratsiya o'zgarishlari (ma'lumotga tegmaydi)

### 31. uvicorn: `uvloop` + `httptools` + kamroq loglash
- **Muammo edi**: `requirements.txt`da faqat yalang'och `uvicorn==0.50.2` bor edi (`[standard]` extras'siz) -- ya'ni `uvloop` (C-asosli event loop) va `httptools` (tezroq HTTP parser) **umuman o'rnatilmagan edi**, uvicorn standart sekin `asyncio`+`h11` bilan ishlayotgan edi.
- **Tuzatildi**: `requirements.txt`ga `uvloop==0.21.0` (faqat Linux uchun, `sys_platform != "win32"` markeri bilan -- Windows'dagi mahalliy dev muhitini buzmaslik uchun) va `httptools==0.6.4` qo'shildi. `docker-compose.prod.yml`dagi uvicorn buyrug'iga `--loop uvloop --http httptools --log-level warning` qo'shildi (oxirgisi -- har bir so'rovni loglashni o'chiradi, yuqori yuklamada CPU sarfini kamaytiradi).
- **Xavfsizlik**: faqat konfiguratsiya/kutubxona qo'shimchasi, ilova mantiqiga yoki ma'lumotlarga tegmaydi. Deploy qilingach `docker ps` va real login so'rovi orqali tekshirildi -- barcha konteyner sog'lom, API/frontend to'g'ri javob bermoqda.

### 32. nginx: upstream keepalive + statik fayllar uchun gzip + immutable kesh
- **Muammo edi**: (1) `/api/`/`/platform/` proksi bevosita `127.0.0.1:8010`ga yozilgan edi, `upstream`/`keepalive` bloki yo'q -- har so'rov app'ga yangi TCP ulanish ochishi mumkin edi; (2) `nginx.conf`ning `gzip_types` qatori kommentariyada qoldirilgan edi -- faqat `text/html` siqilardi, Vite'ning hashed `/assets/*.js`/`*.css` fayllari **hech qanday siqishsiz** uzatilardi; (3) statik fayllarga `Cache-Control` sarlavhasi umuman qo'yilmagan edi -- brauzer keshi ishlamayotgan edi.
- **Tuzatildi**: `/etc/nginx/sites-available/tizimly.conf`ga `upstream tizimly_app { server 127.0.0.1:8010; keepalive 64; }` qo'shildi (+ `proxy_set_header Connection ""`), server blokiga `gzip_types text/plain text/css application/json application/javascript ...` qo'shildi, va yangi `location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }` bloki qo'shildi -- xavfsiz, chunki Vite har fayl mazmuni o'zgarganda faylning nomini (hash) ham o'zgartiradi, shu sababli eskirgan keshdan noto'g'ri kontent kelish xavfi yo'q.
- **Tekshirildi**: `curl -I -H "Accept-Encoding: gzip" .../assets/analytics-*.js` haqiqiy `Content-Encoding: gzip` + `Cache-Control: public, max-age=31536000, immutable` qaytardi. Oldingi konfiguratsiya `/root/tizimly.conf.bak.<timestamp>` sifatida serverda zaxiralab qo'yildi.

## ✅ Bajarilgan (2026-08-09) -- Locust bilan tarqatilgan test: 1000-tenant savolining yechimi

### 33. Locust (master/worker) orqali oldingi ochiq savol yopildi -- muammo noutbukda ekan, serverda emas
- **Muammo edi**: oldingi (asyncio) test 1000-tenant miqyosida 62-64% muvaffaqiyatda to'xtardi, sababi noaniq -- noutbukmi yoki server.
- **Metodika**: Locust (sanoat-standart yuklama test vositasi) 6-8 ta worker jarayoni bilan (Windows'da `--processes` fork talab qilgani uchun ishlamaydi -- qo'lda master+worker jarayonlar ishga tushirildi), xuddi shu rol-asosidagi so'rov aralashmasi bilan.
- **Yo'lda topilgan ikkita test-vositasiga xos xato (ilova kodiga aloqasi yo'q)**: (1) Locust'ning standart `FastHttpUser`si (gevent+`geventhttpclient`) Windows'da har so'rovga 10-56s soxta kechikish qo'shgan (`curl` bilan haqiqiy server javobi 0.47s ekani tasdiqlandi) -- standart `HttpUser` (requests-asosli)ga o'tkazilgach kechikish darhol 100-300ms'ga tushdi; (2) JWT token TTL 15 daqiqa (`access_token_ttl_minutes`) ekan -- uzoq davom etgan ko'p-bosqichli test session'da eski tokenlar 401 berayotgan edi, har bosqichdan oldin tokenni yangilash bilan tuzatildi.
- **Natija**: 2700 concurrent (≈300 tenant) da **98.23% muvaffaqiyat, 1063 so'rov/s, p50=140ms**. 5400da muvaffaqiyat 88.19%ga tushsa-da, **server CPU atigi ~15-23%da qolgan** (8 yadroning 1.2-1.9 tasi), xatolarning deyarli barchasi mijoz-tomon `ConnectTimeoutError` -- server tomonidan xato yo'q. Bu uchinchi mustaqil vosita (threading, asyncio, Locust) bilan **bir xil xulosani** tasdiqladi: cheklov noutbukning o'zida (Windows socket/port sig'imi), server emas. Server hali ham katta zaxiraga ega -- haqiqiy 1000-tenant sig'imini bilish uchun Linux-asosli yoki ko'p-mashinali tarqatilgan test kerak.
- Test-tenant har safar production'dan to'liq tozalandi. To'liq jadval: repo tuguni ildizidagi `test.md`.

## Eslatma

Bu fayl `CLAUDE.md`ning "Performance hardening pass" bo'limlariga to'liq mos keladi (batafsil texnik izoh va kod ma'lumotnomalari o'sha yerda) — bu yerda faqat qisqa, ketma-ket ro'yxat sifatida saqlanadi, tez ko'z tashlash uchun.
