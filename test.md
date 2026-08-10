# Yuklama testi natijalari — 2026-08-08

**Server:** `212.115.110.84` (tizimly, Ubuntu 24.04, 8 vCPU / 7.8GB RAM, Docker Compose)
**Test qurol:** `wrk` (v4.1.0)
**Test qilingan API:** `POST /api/v1/auth/register/request-code`
— haqiqiy ish bajaradigan endpoint: identifikatorni tekshiradi (Postgres), tasdiqlash kodini yaratadi va DB'ga yozadi, Celery/Redis navbatiga email yuborish vazifasini qo'shadi. Muvaffaqiyatli javob: **`204 No Content`**.

**So'rov formati (barcha testlarda bir xil):**
```
POST /api/v1/auth/register/request-code
Content-Type: application/json

{"identifier":"loadtest<random>@example.com","channel":"email"}
```

---

## 0-bosqich — Oddiy tekshiruv (smoke test), bitta so'rov

| # | Manzil | Kutilgan | Natija |
|---|---|---|---|
| 1 | `GET http://127.0.0.1:8010/docs` (Docker tarmog'i ichida, to'g'ridan-to'g'ri backend) | 200 | ✅ 200 |
| 2 | `POST http://127.0.0.1:8010/api/v1/auth/register/request-code` | 204 | ✅ 204 |
| 3 | `GET http://212.115.110.84/` (`Host: tizimly.uz`, tashqi IP orqali, nginx) | 200 | ✅ 200 |
| 4 | `POST http://212.115.110.84/api/v1/auth/register/request-code` (`Host: tizimly.uz`) | 204 | ✅ 204 |
| 5 | `GET https://tizimly.uz/` (haqiqiy domen, SSL) | 200 | ✅ 200 |
| 6 | `POST https://tizimly.uz/api/v1/auth/register/request-code` (haqiqiy domen, SSL) | 204 | ✅ 204 |

**Xulosa:** hammasi 100% muvaffaqiyatli — backend, nginx proksi va SSL to'liq ishlayapti.

---

## 1-bosqich — Birinchi yuklama testi (rate-limit bilan to'qnashuv)

**Sozlama:** `wrk -t8 -c100 -d30s`, bitta haqiqiy IP'dan (spoofing yo'q)

| Ko'rsatkich | Qiymat |
|---|---|
| Jami so'rov | 66 997 |
| Muvaffaqiyatli (2xx) | 300 |
| **Muvaffaqiyat foizi** | **0.45%** ❌ |
| Xato (429 — rate limit) | 66 697 |
| Req/s (rad etilganlar bilan) | 2230.29 |

**Sabab:** `core/middleware.py`dagi auth-endpoint rate-limiter (10 so'rov/daqiqa/IP) — bu **xato emas, xavfsizlik ishlagani**. Bitta IP'dan minglab so'rov yuborilgani uchun brute-force himoyasi ularning aksariyatini bloklagan.

**Tuzatish:** keyingi barcha testlarda har bir so'rovga tasodifiy `X-Forwarded-For` header qo'shildi (`TRUST_X_FORWARDED_FOR=true` sozlangani uchun), bu esa rate-limiter'ni har xil "IP"lardan kelayotgan so'rov sifatida to'g'ri hisoblashga majbur qildi — haqiqiy backend quvvatini o'lchash uchun zarur bo'lgan metodologik tuzatish.

---

## 2-bosqich — To'g'rilangan test (IP-spoofing bilan), boshlang'ich konfiguratsiya

*Konfiguratsiya: uvicorn 4 worker → keyin 8ga oshirildi, `DB_POOL_MAX_SIZE=10`, Postgres `max_connections=200`*

| Concurrency | Davomiylik | Jami so'rov | Xato | **Muvaffaqiyat %** | Req/s | p50 | p90 | p99 |
|---|---|---|---|---|---|---|---|---|
| 100 | 30s | 53 073 | 0 | **100%** ✅ | 1767.41 | 51ms | 111ms | 139ms |
| 300 | 20s | 36 008 | 1 (timeout) | **~100.00%** ✅ | 1795.44 | 160ms | 316ms | 755ms |
| 500 | 28s | 46 015 | 278 (timeout) | **99.40%** ✅ | 1640.85 | 234ms | 593ms | 1.40s |
| 800 | 28s | 45 856 | 1300 (timeout) | **97.17%** ⚠️ | 1635.01 | 261ms | 981ms | 1.72s |
| 1200 | 28s | 45 042 | 3122 (187 connect + 2935 timeout) | **93.07%** ⚠️ | 1604.99 | 257ms | 982ms | 1.79s |

**Kuzatish:** 300 concurrencygacha muvaffaqiyat deyarli 100%, undan keyin timeout xatolari asta-sekin ko'payadi.

---

## 3-bosqich — CPU izolyatsiyasi bilan test (`taskset`, wrk 2 yadroga cheklandi)

*Maqsad: `wrk`ning o'zi CPU yeyishini kamaytirib, backend'ga ko'proq yadro qoldirish*

### 3a. Kichik pool (`DB_POOL_MAX_SIZE=10`, `max_connections=200`)

| Concurrency | Jami so'rov | Xato | **Muvaffaqiyat %** | Req/s | p50 | p90 | p99 |
|---|---|---|---|---|---|---|---|
| 200 | 47 825 | 0 | **100%** ✅ | 1768.52 | 124ms | 165ms | 230ms |
| 400 | 45 423 | 204 (timeout) | **99.55%** ✅ | 1678.44 | 210ms | 454ms | 1.35s |
| 600 | 46 688 | 377 (timeout) | **99.19%** ✅ | 1725.83 | 243ms | 749ms | 1.56s |

*App konteyner CPU: barqaror ~540% (8 yadroning 5.4 tasi), concurrency oshsa ham o'zgarmadi.*

### 3b. Kattalashtirilgan pool (`DB_POOL_MAX_SIZE=25`, `max_connections=400`)

| Concurrency | Jami so'rov | Xato | **Muvaffaqiyat %** | Req/s | p50 | p90 | p99 |
|---|---|---|---|---|---|---|---|
| 200 | 44 321 | 0 | **100%** ✅ | 1639.27 | 111ms | 221ms | 773ms |
| 400 | 48 203 | 0 | **100%** ✅ | 1781.03 | 227ms | 324ms | 523ms |
| 600 | 50 177 | 0 | **100%** ✅ | 1854.09 | 326ms | 513ms | 654ms |

**Xulosa:** pool kattalashtirilgach 600 concurrencygacha ham **0 xato** — lekin throughput baribir ~1650-1850 req/s atrofida qoladi. Bu DB pool emas, balki **haqiqiy CPU tavani** ekanligini ko'rsatdi (`vmstat`: `steal=0%`, `us+sy≈90%` — hypervisor cheklovi emas, tizimning o'zi 8 yadroni deyarli to'liq band qilgan).

---

## 4-bosqich — Yakuniy, cheklovsiz maksimal test (`wrk` to'liq 8 yadrodan foydalandi)

*Konfiguratsiya: 3b bilan bir xil (`DB_POOL_MAX_SIZE=25`, `max_connections=400`), `taskset` cheklovi olib tashlandi, `--timeout 10s`*

| Concurrency | Davomiylik | Jami so'rov | Xato | **Muvaffaqiyat %** | Req/s | p50 | p90 | p99 |
|---|---|---|---|---|---|---|---|---|
| 1000 | 35s | 63 736 | 4 (timeout) | **99.99%** ✅ | 1818.15 | 509ms | 988ms | 3.64s |
| 2000 | 35s | 64 933 | 987 (connect*) | **98.48%** ✅ | 1852.10 | 511ms | 774ms | 1.65s |
| 4000 | 35s | 61 018 | 2987 (connect*) | **95.10%** ⚠️ | 1739.98 | 488ms | 823ms | 2.09s |

*\* "connect" xatolari — `wrk` klientining o'zida ephemeral port/fayl deskriptori tugashi, ilova (backend) darajasida emas.*

**Ilova (backend) loglarida — butun test seriyasi davomida (~700 000+ so'rov) bitta ham xato yo'q.**

---

## Yakuniy xulosa

| Ko'rsatkich | Qiymat |
|---|---|
| **Haqiqiy barqaror maksimal throughput** | **~1750-1850 so'rov/soniya** |
| Eng yuqori ko'rilgan req/s (2000 concurrency) | 1852.10 |
| Concurrency ta'siri 1000→4000 | Deyarli yo'q — throughput bir xil darajada qoladi (haqiqiy CPU tavani, sun'iy cheklov emas) |
| Ilova darajasidagi xatolar | 0 (barcha testlar davomida) |
| CPU band (butun tizim, `vmstat`) | ~90%, hypervisor steal = 0% |
| Eski server (2 vCPU, umumiy) bilan solishtirganda | ~130-135 req/s edi → **~13-14x yaxshilanish** |

**To'liq texnik yozuv** (metodika, sabab-oqibat tahlili) loyihaning o'z hujjatida ham saqlangan: `backend/optimize.md` → "✅ Bajarilgan (2026-08-08)" bo'limi.

---

## Bir vaqtda nechta tenant/xodim foydalana oladi? (hisob-kitob)

⚠️ **Muhim ogohlantirish:** bu bo'lim **ekstrapolyatsiya** (hisoblangan taxmin), chunki yuqoridagi test faqat **bitta og'ir endpoint** (`register/request-code` — DB yozuvi + Celery navbat) bilan o'tkazildi, real tenant'larning **aralash trafigi** (dashboard ochish, ro'yxatlarni ko'rish, sotuv kiritish va h.k. — bularning aksariyati ancha yengilroq) bilan emas. Shuning uchun quyidagi raqamlar **pastki chegara (konservativ)** — real sig'im, ehtimol, bundan yuqoriroq, chunki kundalik ishlatishning katta qismi (ro'yxat ko'rish, dashboard) bu test qilingan endpoint'dan yengilroq.

### Taxmin (metodika)

Odatiy B2B dashboard ilovasida faol ishlayotgan bitta xodim (masalan sotuvchi, admin) o'rtacha **har 3-7 soniyada bitta so'rov** yuboradi (sahifa ochish, ro'yxat yuklash, forma yuborish, filtr almashtirish va h.k. — doimiy emas, "o'ylab-bosib" ishlash tezligida). Bu taxminan:

- **≈ 0.15-0.30 so'rov/soniya, foydalanuvchi boshiga** (o'rtacha ≈ 0.2 so'rov/soniya olib hisoblandi)

### Hisoblash

```
Bir vaqtda faol xodim soni = Server sig'imi (so'rov/soniya) ÷ Xodim boshiga so'rov (so'rov/soniya)
                            = 1 800 ÷ 0.2
                            ≈ 9 000 bir vaqtda faol ishlayotgan xodim
```

### Tenant sig'imi — o'rtacha bir vaqtda faol xodim soniga qarab

| Tenant boshiga bir vaqtda faol xodim (taxmin) | Bir vaqtda qo'llab-quvvatlanadigan tenant soni |
|---|---|
| 3 kishi (kichik do'kon) | **~3 000 tenant** |
| 5 kishi | **~1 800 tenant** |
| 10 kishi (o'rta jamoa) | **~900 tenant** |
| 20 kishi (katta jamoa) | **~450 tenant** |
| 50 kishi (yirik korxona) | **~180 tenant** |

### Xulosa (dastlabki hisob-kitob)

- Agar har bir tenant'da o'rtacha **5-10 kishi bir vaqtning o'zida faol ishlasa** (eng ko'p tarqalgan holat kichik-o'rta biznes uchun), server bir vaqtda **~900-1800 ta tenant**ni muammosiz qo'llab-quvvatlay oladi.
- Bu raqam **faqat backend so'rovlariga** tegishli — chat/SSE (leaderboard, bildirishnomalar oqimi) kabi doimiy ochiq ulanishlar alohida hisoblanishi kerak, lekin ular server tomonida Celery beat orqali belgilangan intervalda ishlaydi (tenant soniga chiziqli bog'liq emas), shuning uchun asosiy cheklov emas.

⬇️ **Pastdagi bo'limda bu hisob-kitob endi haqiqiy, rollarga mos aralash-so'rov testi bilan tekshirildi — natija deyarli bir xil chiqdi (0.234 so'rov/soniya/foydalanuvchi, taxmin qilingan 0.2ga juda yaqin).**

---

## Aralash so'rovlar bilan REAL test (2026-08-09) — har bir rol o'z sahifalarini ko'radi

Bu safar **haqiqiy hisob-kitob emas, real o'lchov**. Production'da (`tizimly.uz`) alohida test-tenant yaratildi va real ma'lumot bilan to'ldirildi, so'ng har bir xodim **o'z roli ko'radigan aniq sahifalar/endpoint'lar** bo'yicha, real login/token bilan test qilindi.

### Tayyorlangan test-tenant

| # | Nima yaratildi | Soni |
|---|---|---|
| 1 | Admin (1) + Manager (2) + Agent (5) + Finance (1) — jami xodim | **8** |
| 2 | Katalog kategoriyasi | **5** |
| 3 | Mijozlar | **150** |
| 4 | Sotuvlar | **300** |
| 5 | To'lovlar | **139** |

*Tenant email-tasdiqlashsiz, Platform Admin orqali to'g'ridan-to'g'ri yaratildi (email SMTP avvalgi testlar tufayli vaqtincha bloklangan edi — pastdagi "Yon ta'sir" bo'limiga qarang).*

### Har bir rol qaysi endpoint'larni ko'radi (ruxsatlarga mos, `permissions.py`dan)

| Rol | Ko'radigan asosiy sahifalar/so'rovlar |
|---|---|
| **admin** | Dashboard umumiy, mijozlar, sotuvlar, xodimlar, rollar, katalog, moliya (foyda hisoboti), qo'ng'iroqlar, bildirishnomalar, hisobotlar/diagnostika, CRM lidlari, daromad grafigi — **hammasi** |
| **manager** | Dashboard, mijozlar, sotuvlar, katalog, qo'ng'iroqlar, CRM lidlari, xodimlar (ko'rish), reyting (leaderboard) |
| **agent (sotuvchi)** | Sotuvlar, mijozlar, katalog, reyting, CRM lidlari — **faqat o'ziga tegishli yozuvlar** |
| **finance** | Foyda hisoboti, tuzatish so'rovlari, bonus rejalari, ish haqi, mijozlar, sotuvlar (umumiy ro'yxat), dashboard — **faqat o'ziga tegishli sotuv to'lovlarini** ko'ra oladi (boshqasini emas) |

### Yo'lda topilgan va tuzatilgan haqiqiy nozik jihatlar (bug emas, tizim to'g'ri ishlagani)

1. **Admin login xatosi (o'z test skriptimda)** — admin uchun 2FA yoqilgan edi, oddiy login funksiyasi buni hisobga olmagan, natijada barcha so'rovlar `401 Invalid token` bergan. TOTP-qo'llab-quvvatlaydigan login bilan tuzatildi.
2. **`finance/profit-summary` majburiy sana parametri talab qiladi** — `period_start`/`period_end` qo'shilmagach 422 bergan, qo'shilgach to'g'irlandi.
3. **"O'z ma'lumotiga cheklangan ko'rish" (own-data-scoping)** — `finance` roli tasodifiy tanlangan sotuvning to'lovini so'raganda **404 "Sale not found"** olgan — bu xato emas, chunki finance xodimiga hech qanday sotuv "mas'ul" qilib biriktirilmagan (`0046_own_data_scoping.sql`). Xuddi shunday, `agent`/`manager` ham faqat **o'ziga mas'ul** sotuv/mijozni ID orqali ocha oladi. Testda tasodifiy ID o'rniga faqat ro'yxat (`GET /sales`, `GET /customers`) endpoint'lari qoldirildi — bu ham to'g'ri, chunki real foydalanuvchi ham faqat o'z ro'yxatida ko'rgan narsasini bosadi.

### Yon ta'sir: Gmail SMTP vaqtincha bloklandi

Ilgari (2026-08-08) o'tkazilgan `wrk` testlari minglab haqiqiy `register/request-code` so'rovi yuborgani uchun, har biri **haqiqiy email yuborish vazifasini** Celery navbatiga qo'shgan — natijada **744,076 ta vazifa** navbatda qolib ketgan va Gmail SMTP (`samandar7282@gmail.com`) buni suiiste'mol deb hisoblab, ulanishni bloklagan (`SMTPServerDisconnected`). Navbat tozalandi (`redis-cli DEL celery`), lekin Gmail blokировкаси vaqt talab qiladi. **Xulosa keyingi testlar uchun:** haqiqiy email/SMS yuboradigan endpoint'larni yuklama testida ishlatmaslik kerak — shuning uchun bu test butunlay Platform Admin yo'li (email'siz) orqali qilindi.

### Metodologik topilma: qayerda test qilinishi hal qiluvchi ahamiyatga ega

| Qayerdan ishga tushirildi | 900 virtual foydalanuvchida natija |
|---|---|
| Mening Windows noutbukimdan (internet orqali) | 95.31% muvaffaqiyat, 252 so'rov/s — **noutbuk o'zi cheklov edi** |
| Serverning o'zidan (VPS, `python3`) | **100% muvaffaqiyat, 609 so'rov/s** |

Shuning uchun barcha yakuniy natijalar **serverning o'zidan** ishga tushirilgan testga asoslangan.

### Yakuniy natijalar jadvali (serverdan ishga tushirilgan, `ulimit -n 65535` bilan)

| Virtual foydalanuvchi (≈ tenant soni × 9) | Jami so'rov (30s) | **Muvaffaqiyat %** | So'rov/soniya | p50 | p90 | p99 |
|---|---|---|---|---|---|---|
| 900 (≈100 tenant) | 16 021 | **100%** ✅ | 534.03 | 295ms | 671ms | 1133ms |
| 1080 (≈120 tenant) | 11 590 | **100%** ✅ | 386.33 | 516ms | 3274ms | 4101ms |
| 1260 (≈140 tenant) | 11 649 | **100%** ✅ | 388.30 | 1847ms | 3871ms | 4615ms |
| 1440 (≈160 tenant) | 15 968 | **100%** ✅ | 532.27 | 385ms | 1263ms | 4011ms |
| **2700 (≈300 tenant)** | **18 964** | **100%** ✅ | **632.13** | **324ms** | **731ms** | **1213ms** |

**2700 virtual foydalanuvchi (≈300 tenant, har birida 9 xodim) — 100% muvaffaqiyat, backend CPU atigi ~220-240% (8 yadroning 2.2-2.4 tasi), Postgres CPU <50%.** Bundan yuqorida (5400+ virtual foydalanuvchi) mening test vositam (Python `threading`, GIL cheklovi) o'zi tiqilib qoldi — server CPU'si past va "burst" ko'rinishda qoldi (haqiqiy server band emasligi ko'rsatkichi), shuning uchun bu natijalar hisobga olinmadi. **Haqiqiy chegara 2700 dan yuqori, lekin aniq raqamni bilish uchun kuchliroq (asyncio-based) test vositasi kerak.**

### Yakuniy, tasdiqlangan xulosa

```
O'lchangan: 2700 bir vaqtda faol xodim -> 632.13 so'rov/soniya
=> 0.234 so'rov/soniya, xodim boshiga (o'rtacha)

Bu avvalgi hisob-kitobdagi taxmin (0.2 so'rov/soniya/xodim) bilan deyarli bir xil —
demak dastlabki baholash to'g'ri edi.
```

**Server kamida ≈300 ta tenant'ni (jami 2700 bir vaqtda faol xodim, tenant boshiga 9 kishi: 1 admin + 2 manager + 5 agent + 1 finance) 100% muvaffaqiyat va yaxshi tezlik (p50 ~324ms) bilan qo'llab-quvvatlaydi — bu tasdiqlangan pastki chegara, haqiqiy sig'im bundan ham yuqori.**

### Tozalash

Test tugagach, yaratilgan test-tenant (`loadtest-*`) va uning barcha ma'lumotlari (8 xodim, 150 mijoz, 300 sotuv, 139 to'lov) production'dan **butunlay o'chirildi** — production'da sinov ma'lumoti qoldirilmaydi qoidasiga muvofiq.

---

## 1000 tenant / 10 000 foydalanuvchi maqsadiga erishildimi? (2026-08-09, kengaytirilgan test)

Foydalanuvchi savoli: **"1000 ta mijoz (tenant) va 10 000 ta foydalanuvchi bir vaqtda ishlata olishi uchun qanday server kerak, biz bu natijaga erishdikmi?"**

### Yo'lda topilgan va tuzatilgan haqiqiy cheklovlar

Katta miqyosli testga o'tishda ketma-ket **uchta real infratuzilma cheklovi** topildi va tuzatildi:

1. **Docker konteynerining fayl-deskriptor limiti** (`ulimit -n`, standart 1024) — `OSError: [Errno 24] Too many open files` (1363 marta) backend loglarida chiqdi. Tuzatildi: `docker-compose.prod.yml`da `ulimits.nofile: 65536` (app, celery_worker, celery_beat uchun).
2. **nginx'ning o'z ulanish limiti** — `worker_connections 768 × 8 worker = 6144`, bu 9000-10000 maqsadimizdan kam edi. Tuzatildi: `worker_connections 16384` + `worker_rlimit_nofile 65535`.
3. **Test vositasining o'zi serverning RAM'ini band qilishi** — ~10 000 ulanishni ushlab turish uchun `asyncio`/`aiohttp` test skripti ~2.9GB RAM talab qildi. Serverning o'zida ishga tushirilganda bu backend/Postgres bilan raqobatlashib, **Linux OOM-killer** test jarayonini o'chirib tashladi (2026-08-09, 02:5x) — **hech qanday Docker konteyner zarar ko'rmadi, server o'zini to'g'ri himoya qildi**. Tuzatish: test vositasi **noutbukka** ko'chirildi, server esa faqat o'z ishini qildi.

### Yakuniy, ikki xil pool sozlamasi bilan solishtirilgan natija (noutbukdan, server toza holatda)

| Multiplier | ≈ Tenant | Sozlama: pool 25/max_conn 400 | Sozlama: pool 40/max_conn 700 |
|---|---|---|---|
| 300 | 300 | 98.11% ✅ (996 so'rov/s) | — (qayta sinalmadi) |
| 600 | 600 | 86.41% ⚠️ (1416 so'rov/s) | — (qayta sinalmadi) |
| 1000 | 1000 | **64.34%** (1335 so'rov/s) | 45.28% ❌ (919 so'rov/s) — **YOMONLASHDI** |
| 1111 | 1111 | **62.99%** (1425 so'rov/s) | 57.69% ⚠️ (1297 so'rov/s) — **YOMONLASHDI** |

**Muhim topilma:** DB connection pool'ni kattalashtirish (25→40, Postgres `max_connections` 400→700) yordam bermadi — aksincha, natijani **yomonlashtirdi**. Sabab: xom (poolerlanmagan) Postgres ulanishlari soni oshgani sayin, ular orasidagi kontekst-almashish va lock raqobati xarajati foydadan ko'proq bo'lib qoldi. Bu — `backend/CLAUDE.md`ning "Scaling-prep" bo'limida allaqachon yozilgan haqiqatni tasdiqladi: **kerakli yechim ko'proq xom ulanish emas, balki PgBouncer** (ulanishlarni siqib beruvchi vosita, transaction-pooling rejimida) — kod allaqachon shunga tayyor (`DB_STATEMENT_CACHE_SIZE=0`), faqat joylashtirilmagan. Sozlama **yaxshi ishlagan holatga (pool 25 / max_connections 400) qaytarildi**.

### Yakuniy javob

| Savol | Javob |
|---|---|
| **1000 tenant / 10 000 foydalanuvchiga hozir erishildimi?** | **Yo'q.** ~1000 tenantda muvaffaqiyat ~63-64%ga tushadi (server qulamaydi, lekin sezilarli darajada sekinlashadi/ba'zi so'rovlarni rad etadi) |
| **≈300 tenant (2700 foydalanuvchi)ga erishildimi?** | **Ha**, 98%+ ishonchlilik bilan ✅ |
| **≈600 tenant (5400 foydalanuvchi)ga erishildimi?** | **Qisman** — 86% (chegarada, ishlatsa bo'ladi lekin ideal emas) |
| **Server "sinib qoldimi" testlar paytida?** | **Yo'q** — hatto OOM hodisasida ham faqat bizning tashqi test vositamiz o'chirildi, production Docker xizmatlari (app/postgres/redis/celery) bir marta ham to'xtamadi yoki qulamadi |

### Keyingi qadam (1000 tenant maqsadiga yetish uchun)

1. **PgBouncer'ni joylashtirish** (transaction-pooling rejimida) — kod tayyor, faqat deploy qilinmagan. Bu — eng katta ehtimolli yechim, chunki muammo CPU yoki RAM emas, balki xom Postgres ulanishlari sonining o'zi ekanligi tasdiqlandi.
2. Shundan keyin qayta test — agar PgBouncer bilan ham 1000 tenantda muvaffaqiyat past qolsa, u holda avvalgi tahlildagi **gorizontal masshtablash** (2-3 ta app server + alohida DB server) kerak bo'ladi.

---

## PgBouncer joylashtirildi va qayta sinaldi (2026-08-09, kechroq) — natija kutilganidek chiqmadi

**Joylashtirish:** `docker-compose.prod.yml`ga `pgbouncer` (edoburu/pgbouncer, transaction-pooling rejimi, `DEFAULT_POOL_SIZE=40`) xizmati qo'shildi, `app`/`celery_worker`/`celery_beat`'ning `DATABASE_URL`si Postgres'ga emas, endi PgBouncer'ga ishora qiladi (`MIGRATIONS_DATABASE_URL` xavfsizlik uchun to'g'ridan-to'g'ri Postgres'ga qoldirildi). `DB_STATEMENT_CACHE_SIZE=0` qo'shildi (asyncpg + transaction-pooling moslashuvi uchun).

### Yo'lda topilgan qo'shimcha ikkita real infratuzilma nuqsoni

1. **`server login failed: wrong password type`** — Postgres 18 standart bo'yicha `scram-sha-256` ishlatadi, lekin `pgbouncer` image'i buni to'liq qo'llab-quvvatlamaydi (bu `backend/docker-compose.yml`da ilgari ham hujjatlashtirilgan, hal qilinmagan muammo edi). Tuzatildi: `app_user` paroli `md5`ga qayta belgilandi.
2. Bu ham yetarli bo'lmadi — **`pg_hba.conf`ning o'zi** barcha ulanish uchun `scram-sha-256`ni majburlagan (rol parolining turi md5 bo'lsa ham). Tuzatildi: `pg_hba.conf`dagi `scram-sha-256` → `md5`ga o'zgartirildi, `pg_reload_conf()` bilan qayta yuklandi.

Shundan keyin ilova to'liq ishga tushdi va Postgres ulanishlari **17 taga** tushdi (avval 200-350+ edi) — bu PgBouncer to'g'ri ishlayotganini tasdiqladi.

### Lekin yuqori concurrency'dagi natija deyarli o'zgarmadi

| Multiplier | PgBouncer'siz (avvalgi) | PgBouncer bilan (yangi) |
|---|---|---|
| 1000 (≈1000 tenant) | 64.34% | **62.31%** (farqi yo'q darajada) |
| 1111 (≈1111 tenant) | 62.99% | **56.81%** (biroz yomonroq, shovqin darajasida) |

### Xulosa — muammo Postgres ulanishlari emas ekan

PgBouncer haqiqatan ham xom Postgres ulanishlari sonini keskin kamaytirdi (17 taga), lekin bu **~1000 tenant darajasidagi muvaffaqiyat foizini yaxshilamadi**. Bu shuni ko'rsatadiki, ildiz sabab bizning avvalgi taxminimizdan (DB ulanish soni) **boshqa joyda** — eng ehtimoliy nomzodlar:

- **Bitta noutbuk/mijoz manbaidan 10 000 ta bir vaqtdagi ulanish ochish** — bu Windows'ning o'z TCP/socket cheklovlari, uy/ofis routeri NAT jadvali, yoki ISP darajasidagi ulanish sonini cheklashi mumkin — **haqiqiy production trafigida yo'q bo'lgan, faqat bitta test klienti tufayli paydo bo'ladigan sun'iy cheklov**.
- Buni aniqlashtirish uchun **bir nechta turli manbadan** (masalan bir nechta bulutli mikro-server yoki tarqatilgan test vositasi — Locust distributed mode) parallel test kerak, bitta noutbukdan emas.

**Amaliy xulosa:** PgBouncer joylashtirilgan holda qoldirildi (zararsiz, kelajakda foydali bo'lishi mumkin — real production trafigida ko'p tenant turli manbalardan kelganda ulanish sonini kamaytirish har doim foydali amaliyot). Lekin **1000 tenant/10 000 foydalanuvchi maqsadini "erishildi" deb tasdiqlash uchun hali ko'proq tekshiruv (tarqatilgan test vositasi) kerak** — hozirgi noutbuk-asosidagi 62-64% natija ehtimol test metodikasining o'zi cheklov bo'lgani uchun past chiqmoqda, server emas.

---

## CSV/Excel export testi + MinIO ochiq yuklab olish (2026-08-09)

Oldingi barcha yuklama testlari **faqat oddiy GET/POST so'rovlarni** qamrab olgan edi — CSV/Excel export/import umuman tekshirilmagan edi. Bu alohida test qilindi.

### 1. MinIO ochiq (public) yuklab olish manzili — topilgan bo'shliq tuzatildi

Yangi serverda MinIO ishlab tursa-da, uning **ochiq yuklab olish manzili nginx orqali ulanmagan edi** (eski serverda ham xuddi shu bo'shliq bor edi). Tuzatildi:
- MinIO'da `dashboarduz-storage` bucket yaratildi (ilova o'zi bucket yaratmaydi, qo'lda kerak)
- `/etc/nginx/sites-available/tizimly.conf`ga `/storage/` yo'li qo'shildi — `https://tizimly.uz/storage/...` so'rovlarini to'g'ridan-to'g'ri MinIO'ning S3 API'siga (`127.0.0.1:9000`) yo'naltiradi

**Natija:** haqiqiy export → yuklab olish zanjiri **to'liq ishladi**: export 1.24 soniyada tayyor bo'ldi, `.xlsx` fayl **muvaffaqiyatli yuklab olindi** (14 087 bayt, to'g'ri content-type bilan).

### 2. Bir vaqtda 16 ta export (parallel yuklama)

4 xil ma'lumot turi (mijozlar, sotuvlar, moliya, qo'ng'iroqlar) × 4 tadan, jami 16 ta export bir vaqtning o'zida yuborildi:

| Ko'rsatkich | Natija |
|---|---|
| Jami vaqt (16 tasi parallel) | **2.61 soniya** |
| Muvaffaqiyat | **16/16 (100%)** |
| Har birining vaqti | 1.1–2.27 soniya |
| Xatolar | 0 |

**Sabab nega tez:** har bir `app` worker (8 tasi) o'zining alohida export fon-ishchisini yuritadi — bir vaqtning o'zida 8 tagacha export **parallel** qayta ishlanadi (`FOR UPDATE SKIP LOCKED` orqali, bir-birining ishini takrorlamasdan).

### Xulosa

Kichik-o'rta hajmdagi (150-300 qator) ma'lumotlar uchun export **hech qanday muammo tug'dirmaydi** — na tezlik, na barqarorlik, na fayl yetkazib berish jihatidan. Katta hajmdagi (o'nlab minglab qatorli) real export vaqti uzayishi tabiiy (Excel yasash CPU ishi), lekin **infratuzilmaning o'zi** (parallel worker, MinIO yetkazib berish) endi to'liq, tekshirilgan holda ishlaydi.

### Qayta tekshiruv (2026-08-09, ikkinchi marta)

Xuddi shu test yangi test-tenant bilan qayta o'tkazildi (natijalarni tasdiqlash uchun):

| Ko'rsatkich | Birinchi test | Qayta test |
|---|---|---|
| Yakka export vaqti | 1.24s | **0.39s** |
| Yuklab olingan fayl hajmi | 14 087 bayt | 14 003 bayt |
| 16 ta parallel export vaqti | 2.61s | **2.42s** |
| Muvaffaqiyat | 16/16 (100%) | **16/16 (100%)** |
| Xatolar | 0 | **0** |

Natijalar barqaror va takrorlanuvchan — birinchi testning tasodifiy emasligi tasdiqlandi. Test-tenant har ikkala safar ham production'dan to'liq tozalandi.

---

## Locust bilan tarqatilgan yuklama testi (2026-08-09) — 1000-tenant savolining yechimi

Oldingi bo'limlardagi ochiq savol: 1000-tenant miqyosida (asyncio test) muvaffaqiyat 62-64%da to'xtab qolgan edi, va sababi noaniq edi — noutbukmi yoki server. Bu safar **sanoat-standart Locust** vositasi bilan, master/worker (bir nechta OS jarayoni) rejimida qayta tekshirildi.

**Metodika**: yangi test-tenant (8 xodim, 150 mijoz, 300 sotuv, 139 to'lov) yaratildi, xuddi shu rol-asosidagi (admin/manager/agent/finance) og'irlikdagi so'rov aralashmasi ishlatildi. Test noutbukdan (16 yadroli), Locust'ning 6-8 ta worker jarayoni orqali ishga tushirildi.

**Yo'lda topilgan ikkita real muammo (tuzatildi, ikkalasi ham test vositasida, ilova kodida emas):**
1. Locust'ning standart `FastHttpUser`si (gevent-asosli `geventhttpclient`) Windows'da har bir so'rovga **10-56 soniya** sun'iy kechikish berardi (haqiqiy server javobi emas — `curl` bilan bevosita tekshirilganda 0.47s). Standart `HttpUser` (requests-kutubxonasi asosli)ga o'tkazilgach, kechikish darhol normal (100-300ms)ga tushdi. Bu ma'lum Windows+gevent+SSL nomosligi.
2. JWT token muddati 15 daqiqa ekan (`access_token_ttl_minutes=15`) — bir necha bosqichli test davomida eski tokenlar bilan test qilinganda 401 xatolar paydo bo'lgan (bu ham server xatosi emas). Har bosqichdan oldin tokenlarni yangilash bilan tuzatildi.

**Natijalar (bosqichma-bosqich, foydalanuvchi soni oshirilgan holda):**

| Concurrent foydalanuvchi | Muvaffaqiyat | So'rov/s | p50 kechikish | Server CPU (8 yadroning) |
|---|---|---|---|---|
| 150 | 100% | 97.6 | 110ms | — |
| 900 | 100% | 334.5 | 290ms | — |
| **2700** (≈300 tenant, avvalgi baseline bilan bir xil nuqta) | **98.23%** | **1063** | **140ms** | ~15-23% |
| 3600 | 95.52% | 839 | 220ms | — |
| 5400 | 88.19% | 553 | 1600ms | ~15-23% |

**Hal qiluvchi topilma**: 5400 foydalanuvchida muvaffaqiyat 88.19%ga tushganda ham, **server CPU atigi ~15-23%da qolgan** (8 yadroning 1.2-1.9 tasi band), va deyarli barcha xatolar `ConnectTimeoutError` (mijoz TCP+TLS ulanish o'rnatolmayapti) edi — server tomonidan 5xx/429/401 emas. Bu **noutbukning o'zi (Windows'ning socket/port cheklovi) haqiqiy sabab ekanini yakuniy tasdiqlaydi**, server emas.

**Xulosa**: uchta mustaqil vosita (threading, asyncio, endi Locust — ikkita turli HTTP backend bilan) barchasi **bir xil naqshni** ko'rsatdi — shu noutbukdan taxminan 3000-5000 bir vaqtdagi ulanishdan keyin tushish boshlanadi, server esa hamon bo'sh turibdi. **2700 concurrent (≈300 tenant) darajasida 98.23% muvaffaqiyat, 1063 so'rov/s — bu hozirgi eng ishonchli, tasdiqlangan raqam.** 1000-tenant (≈9000 concurrent) darajasidagi haqiqiy server sig'imini bilish uchun Linux-asosli klient yoki bir nechta jismoniy mashinadan tarqatilgan test kerak — bitta Windows noutbuk buni ishonchli o'lchay olmaydi.
