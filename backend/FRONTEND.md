# Frontend integratsiya qo'llanmasi

Bu fayl frontend jamoasi uchun: qaysi API qaysi sahifada ishlatiladi, API'lar bir-biriga qanday bog'liq, va auth ketma-ketligi qanday ishlaydi. Har bir endpoint'ning aniq request/response maydonlari uchun `/docs` (Swagger UI, avtomatik generatsiya qilingan OpenAPI) — bu fayl esa "qaysi tartibda, nima uchun" degan savolga javob beradi. Modul ichidagi arxitektura qoidalari uchun `CLAUDE.md`ga, umumiy loyiha holatiga esa `README.md`ga qarang.

## Umumiy tamoyillar

- **Base URL**: tenant-facing hamma narsa `/api/v1/...` ostida, platform-darajasi `/platform/v1/...` ostida. Local dev: `http://127.0.0.1:8000`. Staging (hozir foydalanadigan server): **`http://89.43.33.8:8001`** (hozircha TLS'siz — batafsil `CLAUDE.md`ning Deployment bo'limida).
- **Frontend'da base URL'ni hech qachon hardcode qilmang** — o'zingizning `.env`ingizda bitta o'zgaruvchi sifatida saqlang (masalan Next.js'da `NEXT_PUBLIC_API_BASE_URL=http://89.43.33.8:8001`, Vite'da `VITE_API_BASE_URL=...`). Kelajakda server domen+TLS olganda (`https://api.dashboarduz.uz` kabi) — faqat shu bitta qiymatni almashtirasiz, kod ichida hech narsa o'zgarmaydi.
- **CORS**: hozircha `CORS_ALLOWED_ORIGINS=*` (backend'da, staging'da) — frontend qaysi origin'dan (`localhost:3000`, `localhost:5173` va h.k.) so'rov yuborishidan qat'i nazar ishlaydi, chunki hali frontend'ning aniq domeni/porti ma'lum emas. **Bu vaqtinchalik** — frontend real domenga (yoki hech bo'lmasa doimiy dev portga) ega bo'lgach, shuni ayting, men `CORS_ALLOWED_ORIGINS`ni shu aniq origin(lar)ga toraytiraman (xavfsizlik: token'lar credentials orqali yuriladi, umr bo'yi wildcard qoldirish tavsiya etilmaydi).
- **Auth header**: `Authorization: Bearer <access_token>` — access token turi (tenant user / platform admin / dashboard) endpoint kimga tegishli ekaniga qarab farqlanadi (pastga qarang). Noto'g'ri token turi ishlatilsa — 401.
- **Xato formati**: FastAPI standart `{"detail": "..."}`. `401` — token yo'q/noto'g'ri/muddati o'tgan yoki account lock qilingan (barchasi bir xil generic xabar — qaysi sabab ekanini frontend farqlay olmaydi, ataylab shunday, account enumeration'ga qarshi). `403` — permission yo'q YOKI privileged action uchun 2FA yoqilmagan. `404` — resurs shu tenant ichida topilmadi. `409` — optimistic concurrency (`version` eskirgan) yoki idempotency-key konflikti. `422` — validatsiya (FastAPI avtomatik, Pydantic schema asosida).
- **`Idempotency-Key` header** — har bir moliyaviy/yozuv operatsiyasi (`POST /sales`, `POST /finance/payments`, `POST /finance/adjustment-requests`, `POST /finance/adjustment-requests/{id}/approve|reject`, `POST /finance/bonus-plans`) uchun **majburiy**. Frontend har bir foydalanuvchi harakati (masalan "To'lovni saqlash" tugmasi bosilishi) uchun bitta yangi UUID generatsiya qilib, tarmoq xatosi bo'lib qayta yuborilganda **xuddi shu** kalitni qayta ishlatishi kerak — shunda backend ikki marta yozib qo'ymaydi, o'sha birinchi natijani qaytaradi. Yangi harakat = yangi kalit.
- **Pagination yo'q** — hozircha barcha `GET` ro'yxat endpoint'lari butun natijani bitta javobda qaytaradi (`ORDER BY created_at`). Katta ro'yxatlar (masalan `GET /customers`) uchun frontend tarafida cheklov/virtualizatsiya kerak bo'lishi mumkin — backend'da hali `limit`/`offset` yo'q.
- **Pul maydonlari** — har doim `BIGINT` (UZS so'mda, USD sentda), hech qachon float emas. Frontend formatlashda buni hisobga olishi kerak (masalan USD 1050 = $10.50).

## Auth ketma-ketligi

Loyihada **uchta alohida JWT audience** bor — bir-birining o'rniga ishlatib bo'lmaydi (`type` claim orqali backend'da tekshiriladi):

| Audience | Kim uchun | Login endpoint | Prefix |
|---|---|---|---|
| `access`/`refresh` | Tenant foydalanuvchisi (admin/manager/agent/finance/custom rol) | `POST /api/v1/auth/login` | `/api/v1/...` |
| `platform_access`/`platform_refresh` | Platform Admin | `POST /platform/v1/auth/login` | `/platform/v1/...` |
| `dashboard_session` (access-only, refresh yo'q) | Kiosk/Live Leaderboard ekrani | `POST /api/v1/dashboard-sessions/login` | `/api/v1/dashboard-sessions/...` |

### 0) Ro'yxatdan o'tish (self-service, hech qanday admin kerak emas) — 2026-07-09'dan real

**Tenant o'zi ro'yxatdan o'tadi** — email YOKI telefon orqali (ikkalasi ham bir xil oqimdan o'tadi), Tenant Admin panelida "Ro'yxatdan o'tish" tugmasi bor. Platform Admin bu oqimda **umuman qatnashmaydi** (u endi faqat nazoratchi — pastdagi "Platform-Admin-provisioned (ikkinchi, yordamchi yo'l)" bo'limiga qarang).

**1-qadam — kod so'rash**
```
POST /api/v1/auth/register/request-code
{ "identifier": "user@example.com" }        // yoki { "identifier": "+998901234567" }
→ 204
→ 409 { "detail": "This email/phone is already registered" }   // agar allaqachon mavjud bo'lsa
```
`identifier`da `@` bo'lsa — email deb hisoblanadi (kod email orqali, hozircha faqat log — real email provayder ulanmagan). `@` bo'lmasa — telefon deb hisoblanadi, kod **Telegram'ning rasmiy Gateway API'si** orqali yuboriladi (real, ishlaydi — foydalanuvchining shu raqamga bog'langan Telegram akkauntiga xabar sifatida keladi, bot bilan oldindan bog'lanish shart emas). **Muhim farq login/OTP/parol-tiklashdan**: bu yerda identifier band bo'lsa aniq 409 qaytadi (oddiy ro'yxatdan o'tish shakli UX'i, "bu email band" — enumeration xavfi emas, chunki foydalanuvchi YANGI hisob ochishga urinyapti, mavjudini qidirmayapti).

**2-qadam — kodni tasdiqlash**
```
POST /api/v1/auth/register/verify-code
{ "identifier": "user@example.com", "code": "123456" }
→ 200 { "registration_token": "..." }
→ 401   // noto'g'ri/eskirgan kod, 5 urinishdan keyin ham 401
```
`registration_token` qisqa umrli (~5 daqiqa) — shu identifier haqiqiy ekanini tasdiqlaydi, 3-qadamda ishlatiladi.

**3-qadam — kompaniya + parol, va yakunlash (avtomatik login)**
```
POST /api/v1/auth/register/complete
{ "registration_token": "...", "company_name": "Mening Kompaniyam", "slug": "mening-kompaniyam", "password": "..." }
→ 200 { "access_token": "...", "refresh_token": "..." }   // darhol login qilingan, alohida /login chaqirish shart emas
→ 409 "This email/phone is already registered"   // registration_token bilan complete orasida band bo'lib qolgan bo'lsa
→ 409 "This company slug is already in use"       // slug band
```
Fonda avtomatik bajariladigan narsalar: yangi tenant yaratiladi (`status: "trial"`, **15 kunlik trial darhol boshlanadi** — `trial_ends_at = now() + 15 kun`, karta/to'lov ma'lumoti so'ralmaydi), 4 ta standart rol seed qilinadi, va shu identifier bilan **Admin** roli qilib birinchi foydalanuvchi yaratiladi. Agar `identifier_type` phone bo'lsa — user'ning `email`i `null` bo'ladi (email keyinroq alohida qo'shish imkoniyati hozircha yo'q); agar email bo'lsa — `phone` `null` bo'ladi.

**Trial tugagach nima bo'ladi**: agar foydalanuvchi to'lov qilmasa, `trial_ends_at`dan keyin tenant avtomatik `suspended` holatiga o'tadi (Platform Admin'ning `POST /platform/v1/billing/dunning/run` chaqiruvi orqali — hozircha real cron emas, qo'lda/tashqi scheduler orqali ishga tushiriladi). **To'lovni tanlash (trial'ni o'tkazib yuborish)**: `complete` javobidan keyin (allaqachon login qilingan holatda) frontend darhol `GET /api/v1/billing/plans` bilan tariflarni ko'rsatib, `POST /api/v1/billing/payments/initiate` chaqirib Click/Payme'ga yo'naltirishi mumkin — bu allaqachon mavjud, alohida Billing oqimi (pastga qarang), registratsiya endpoint'lari bilan bog'liq emas.

### 1) Tenant foydalanuvchi — oddiy login (2FA yo'q)

```
POST /api/v1/auth/login
{ "identifier": "user@example.com", "password": "..." }   // yoki identifier = telefon
→ 200 { "requires_2fa": false, "access_token": "...", "refresh_token": "..." }
```
**`tenant_slug` shart emas** — `identifier` (email yoki telefon) butun tizim bo'yicha global unique, server qaysi tenant ekanini o'zi aniqlaydi. `access_token`ni har bir keyingi `/api/v1/...` so'roviga `Authorization: Bearer` bilan qo'shing. `access_token` `ACCESS_TOKEN_TTL_MINUTES` (default 15 daqiqa) dan keyin eskiradi:

```
POST /api/v1/auth/refresh
{ "refresh_token": "..." }
→ 200 { "access_token": "...", "refresh_token": "..." }   // eski refresh session revoke, yangisi qaytadi
```

Chiqish:
```
POST /api/v1/auth/logout
{ "refresh_token": "..." }
→ 204
```

**Muhim**: `permissions` va `totp_enabled` claim'lari access token ichiga **login/refresh vaqtida** joylanadi. Ya'ni Tenant Admin foydalanuvchining rolini/huquqlarini o'zgartirsa, o'sha foydalanuvchi buni **keyingi token refresh'idan keyin** ko'radi — darhol emas. Frontend buni kutishi kerak (masalan, "ruxsat yangilandi, qayta kiring" degan xabar).

### 2) Tenant foydalanuvchi — 2FA yoqilgan

```
POST /api/v1/auth/login  { identifier, password }
→ 200 { "requires_2fa": true, "pending_token": "..." }     // access/refresh YO'Q
```
Frontend TOTP kod kiritish ekranini ko'rsatadi:
```
POST /api/v1/auth/2fa/verify-login
{ "pending_token": "...", "code": "123456" }
→ 200 { "access_token": "...", "refresh_token": "..." }
```
`pending_token` qisqa umrli (`TWO_FACTOR_PENDING_TTL_MINUTES`, default 5 daqiqa) — muddati o'tsa foydalanuvchi login'dan qayta boshlashi kerak.

### 3) 2FA yoqish (Sozlamalar sahifasi, allaqachon login qilgan holatda)

```
POST /api/v1/auth/2fa/setup   (Authorization bilan)
→ 200 { "secret": "...", "otpauth_uri": "otpauth://totp/..." }
```
`otpauth_uri`ni QR kod sifatida ko'rsating (Google Authenticator/Authy skanerlashi uchun). Foydalanuvchi ilovadan kodni kiritadi:
```
POST /api/v1/auth/2fa/confirm
{ "code": "123456" }
→ 204   // totp_enabled = true
```
**Muhim**: joriy `access_token` hali eski `totp_enabled:false` claim'ini olib yuradi. `finance.manage`/`finance.approve`/`users.manage`/`roles.manage` kabi **privileged** permission'lardan foydalanish uchun frontend 2FA yoqilgach **darhol `POST /api/v1/auth/refresh` chaqirishi kerak** (yoki foydalanuvchini qayta login qildirishi) — aks holda 2FA texnik jihatdan yoqilgan bo'lsada, eski token bilan 403 qaytaveradi.

### 4) Telefon OTP orqali kirish (parolsiz muqobil login)

```
POST /api/v1/auth/otp/request  { phone }
→ 204   // har doim 204, telefon ro'yxatda bor-yo'qligidan qat'i nazar (enumeration himoyasi)

POST /api/v1/auth/otp/verify   { phone, code }
→ 200 TokenPair   // 5 marta xato kod → 401, qayta kod so'rash kerak
```
`tenant_slug` shart emas (login bilan bir xil global-identifier mantiq). Kod **Telegram orqali** yetkaziladi (`core/notify.py`, Telegram'ning rasmiy Gateway API'si — https://core.telegram.org/gateway) — real SMS provayder emas, lekin real yetkazib berish: foydalanuvchining shu telefon raqamiga bog'langan Telegram akkauntiga xabar sifatida keladi. `TELEGRAM_GATEWAY_API_TOKEN` sozlanmagan bo'lsa (masalan local dev'da), kod faqat log qilinadi, hech qayerga yuborilmaydi.

### 5) Parolni tiklash

```
POST /api/v1/auth/password-reset/request  { identifier }
→ 204   // har doim 204 (enumeration himoyasi)

POST /api/v1/auth/password-reset/confirm  { identifier, token, new_password }
→ 204   // muvaffaqiyatli bo'lsa, shu foydalanuvchining BARCHA refresh session'lari revoke qilinadi (hamma joydan chiqadi)
```
`identifier` `confirm`da ham qayta so'raladi (nafaqat `request`da) — chunki `token` shifrlangan tasodifiy satr (JWT emas), qaysi tenant ekanini o'zi aytmaydi; `identifier` orqali tenant avval aniqlanadi, so'ng shu tenant ichida token tekshiriladi.

### Platform-Admin-provisioned (ikkinchi, yordamchi yo'l — endi asosiy emas)

Bu yo'l hali ham mavjud (masalan korporativ mijoz o'zi ro'yxatdan o'tishni xohlamasa, yoki qo'llab-quvvatlash xizmati birov nomidan tenant ochishi kerak bo'lsa), lekin **oddiy foydalanuvchi frontend'i buni ko'rsatmaydi** — bu alohida, ichki Platform Admin konsoli ishi. Platform Admin (pastdagi 6-bo'limdagi login bilan, 2FA yoqilgan holda) `POST /platform/v1/tenants` bilan tenant, so'ng `POST /platform/v1/tenants/{tenant_id}/admin-user` bilan (majburiy `reason` maydoni, audit log'ga yoziladi) shu tenant'ning birinchi Admin foydalanuvchisini yaratadi. Shu email/parol bilan tenant keyin **1-bo'limdagi oddiy** `POST /api/v1/auth/login`ga kiradi — Platform Admin login'idan butunlay alohida oqim, xuddi self-registratsiyadan keyingidek.

### 6) Platform Admin login — tenant login'ning aynan oynasi, faqat `tenant_slug`/`identifier` yo'q, oddiy `email` bilan

```
POST /platform/v1/auth/login  { email, password }
→ { requires_2fa, pending_token }  yoki  { access_token, refresh_token }
POST /platform/v1/auth/2fa/verify-login  { pending_token, code }
POST /platform/v1/auth/refresh  { refresh_token }
POST /platform/v1/auth/logout   { refresh_token }
POST /platform/v1/auth/2fa/setup / /2fa/confirm — xuddi tenant user'dagidek
```

### 7) Dashboard-only (kiosk / Live Leaderboard ekrani)

```
POST /api/v1/dashboard-sessions/login  { tenant_slug, name, password }
→ 200 { "access_token": "..." }   // refresh YO'Q — muddati (DASHBOARD_SESSION_TTL_HOURS, default 24s) tugasa, shu endpoint'ga qayta murojaat qiling
```
Bu token faqat `/api/v1/dashboard-sessions/...` endpoint'lari uchun ishlaydi (`leaderboard`, `leaderboard/stream`, `course-sales`, `summary`) — oddiy `/api/v1/analytics/...`ga urinsa 401 qaytadi (boshqa JWT audience).

### 8) Hisob qulflanishi (brute-force himoyasi)

Har qanday login (tenant/platform/dashboard) — 5 ketma-ket xato urinishdan keyin 15 daqiqaga qulflanadi. Qulflangan holatda ham javob oddiy `401` (frontend "hisobingiz vaqtincha bloklandi" kabi aniq xabar chiqara olmaydi — bu ataylab shunday, hisob mavjudligini oshkor qilmaslik uchun). Frontend uchun tavsiya: bir nechta ketma-ket 401'dan keyin umumiy "biroz kuting va qayta urinib ko'ring" xabarini ko'rsating.

## Sahifalar bo'yicha API xaritasi

### Ro'yxatdan o'tish / Login / Auth sahifalari
`POST /api/v1/auth/register/request-code`+`/verify-code`+`/complete`, `/login`, `/2fa/verify-login`, `/otp/request`+`/otp/verify`, `/password-reset/request`+`/confirm` — yuqoridagi ketma-ketliklarga qarang. `GET /api/v1/auth/me` — joriy foydalanuvchi profilini olish (header/profil widget uchun; `email`/`phone` ikkalasi ham `null` bo'lishi mumkin emas, lekin bittasi bo'lishi mumkin — phone-only registratsiyadan keyin `email: null`).

### Tenant Admin — Foydalanuvchilar sahifasi
| Endpoint | Permission | Vazifasi |
|---|---|---|
| `POST /api/v1/users` | `users.manage` | Yangi foydalanuvchi yaratish (`role_id` — Rollar sahifasidan tanlanadi). `email` majburiy, `phone` ixtiyoriy — ikkalasi ham global unique (409 `Email already in use` / `Phone already in use`) |
| `GET /api/v1/users` | `users.view` | Ro'yxat |
| `PATCH /api/v1/users/{id}/role` | `users.manage` | Rolni almashtirish |
| `PATCH /api/v1/users/{id}/deactivate` | `users.manage` | Deaktivatsiya |

### Tenant Admin — Rollar/huquqlar sahifasi
| Endpoint | Permission | Vazifasi |
|---|---|---|
| `GET /api/v1/permissions` | (har qanday login qilgan foydalanuvchi) | Butun permission katalogini olish — checkbox ro'yxati chizish uchun |
| `POST /api/v1/roles` | `roles.manage` | Custom rol yaratish (`permissions: string[]` — yuqoridagi katalogdan subset) |
| `GET /api/v1/roles` | `roles.view` | Ro'yxat |
| `PATCH /api/v1/roles/{id}/permissions` | `roles.manage` | Rol huquqlarini tahrirlash |

**Bog'liqlik**: Foydalanuvchilar sahifasidagi "rol" dropdown'i uchun avval `GET /api/v1/roles` chaqiriladi.

### Katalog (mahsulot/xizmat ierarxiyasi) sahifasi
| Endpoint | Permission | Vazifasi |
|---|---|---|
| `POST /api/v1/catalog/categories` | `catalog.manage` | Yangi turkum (`parent_id` — daraxtda ichma-ich joylashtirish uchun, `null` = root) |
| `GET /api/v1/catalog/categories` | `catalog.view` | **Butun daraxt** bitta so'rovda, nested (`children[]`) holda |
| `PATCH /api/v1/catalog/categories/{id}` | `catalog.manage` | Nomini o'zgartirish |
| `DELETE /api/v1/catalog/categories/{id}` | `catalog.manage` | O'chirish — agar bola-turkumlari bo'lsa 409 (avval bolalarini o'chirish kerak) |

**Bog'liqlik**: Sales sahifasidagi "turkum" tanlash dropdown/tree-select shu `GET /catalog/categories` natijasidan to'ldiriladi.

### Mijozlar / CRM sahifasi
| Endpoint | Permission | Vazifasi |
|---|---|---|
| `POST /api/v1/customers` | `customers.manage` | Yangi mijoz/lead (`phone` tenant ichida unique — dublikat 409/`null` beradi) |
| `GET /api/v1/customers` | `customers.view` | Ro'yxat |
| `GET /api/v1/customers/{id}` | `customers.view` | Kartochka |
| `PATCH /api/v1/customers/{id}` | `customers.manage` | Tahrirlash — `stage` o'zgarsa avtomatik tarixga yoziladi |
| `POST /api/v1/customers/{id}/activities` | `customers.manage` | Qo'lda eslatma/qo'ng'iroq/email/uchrashuv yozish |
| `GET /api/v1/customers/{id}/activities` | `customers.view` | CRM tarixi (avtomatik `status_change` yozuvlari bilan birga) |

**Bog'liqlik**: Sale yaratish sahifasidagi "mijoz" tanlash shu `GET /customers` natijasidan.

### Savdo (Sales) sahifasi
| Endpoint | Permission | Vazifasi |
|---|---|---|
| `POST /api/v1/sales` | `sales.manage` | Yangi shartnoma. **`Idempotency-Key` majburiy.** `customer_id` (majburiy, Customers'dan), `catalog_category_id` (ixtiyoriy, Catalog'dan), `responsible_user_id` (Users'dan) |
| `GET /api/v1/sales` | `sales.view` | Ro'yxat |
| `GET /api/v1/sales/{id}` | `sales.view` | Kartochka (`version` maydoniga e'tibor bering — `PATCH`da kerak) |
| `PATCH /api/v1/sales/{id}` | `sales.manage` | Narx/muddat/holat/mas'ul o'zgartirish — **`body.version`** joriy `GET`dan olingan qiymat bilan bir xil bo'lishi kerak, aks holda 409 (someone else o'zgartirgan — frontend qayta `GET` qilib, foydalanuvchiga ko'rsatishi kerak) |
| `GET /api/v1/sales/{id}/changes` | `sales.view` | O'zgarishlar tarixi (kim, qachon, nima o'zgardi) |

**Muhim**: `POST /sales` muvaffaqiyatli bo'lganda backend **avtomatik** boshlang'ich `charge` ledger yozuvini yaratadi — frontend alohida `finance` API'ga murojaat qilishi shart emas.

### Moliya (Finance) — Sale kartochkasi ichida
| Endpoint | Permission | Vazifasi |
|---|---|---|
| `POST /api/v1/finance/payments` | `finance.manage` | To'lov yozish (`sale_id`, `amount`, `currency`, `method`). **`Idempotency-Key` majburiy** |
| `GET /api/v1/finance/payments/{sale_id}` | `finance.view` | Shu sale'ning to'lovlar tarixi |
| `GET /api/v1/finance/payments/{sale_id}/ledger` | `finance.view` | Balans (qarz/haqdorlik) — har doim shu endpoint'dan, hech qachon frontendda hisoblamang |
| `POST /api/v1/finance/adjustment-requests` | `sales.manage` | Refund yoki tarif-almashtirish **so'rovi** (`type: "refund"\|"tariff_change"`, `payload`). **`Idempotency-Key` majburiy** |
| `GET /api/v1/finance/adjustment-requests?status_filter=pending` | `finance.view` | Tasdiqlash navbati (Finance/Admin sahifasi uchun) |
| `POST /.../adjustment-requests/{id}/approve` yoki `/reject` | `finance.approve` (**2FA talab qiladi**) | So'rovni ko'rib chiqish. `body.version` — `GET`dan olingan qiymat. `Idempotency-Key` majburiy |

**Muhim ish oqimi**: Agent `sales.manage` bilan refund/tarif-almashtirish so'rovini yaratadi → Finance/Admin (`finance.approve`, 2FA yoqilgan bo'lishi shart) uni tasdiqlaydi/rad etadi. Tasdiqlangan refund avtomatik `refunds` yozuvi + ledger yaratadi; tasdiqlangan tarif-almashtirish sale'ni yangilaydi.

### Bonus/Payroll sahifasi
| Endpoint | Permission | Vazifasi |
|---|---|---|
| `POST /api/v1/finance/bonus-plans` | `finance.manage` | Komissiya rejasi (`applies_to_role_id` — **rolga**, foydalanuvchiga emas — Rollar sahifasidan). `Idempotency-Key` majburiy |
| `GET /api/v1/finance/bonus-plans` | `finance.view` | Ro'yxat |
| `POST /api/v1/finance/payroll/calculate` | `finance.manage` | Davr uchun hisoblash (`period_start`, `period_end`, ixtiyoriy `user_id` filtri) — **on-demand**, background job yo'q, tugma bosilganda ishga tushiriladi |
| `GET /api/v1/finance/payroll` | `finance.view` | Natijalar ro'yxati |

### Qo'ng'iroqlar (Calls) sahifasi
| Endpoint | Permission | Vazifasi |
|---|---|---|
| `POST /api/v1/calls/integrations` | `calls.manage` (**2FA**) | UTEL/Мои звонки webhook sirini ulash (Sozlamalar) |
| `GET /api/v1/calls/integrations` | `calls.manage` | Ulangan integratsiyalar holati |
| `POST /api/v1/calls/manager-mappings` | `calls.manage` (**2FA**) | Provayder extension/agent ID'ni `user_id`ga bog'lash |
| `GET /api/v1/calls/calls` | `calls.view` | Qo'ng'iroqlar ro'yxati (ixtiyoriy `responsible_user_id` filtri) |
| `GET /api/v1/calls/calls/{id}` | `calls.view` | Bitta qo'ng'iroq kartochkasi |
| `GET /api/v1/calls/calls/{id}/recording` | `calls.view` | Short-lived presigned URL — audio pleer shu URL'ni to'g'ridan-to'g'ri `<audio src>` sifatida ishlatadi |

Qo'ng'iroqlar ro'yxati **webhook orqali avtomatik** to'ladi (provayderdan kelgan real vaqt hodisalari) — frontend'da "qo'ng'iroq qo'shish" formasi yo'q, faqat ko'rish.

### Davomat (Attendance) sahifasi
| Endpoint | Permission | Vazifasi |
|---|---|---|
| `POST /api/v1/attendance/check-in` / `/check-out` | permission kerak emas (`get_current_user`) | Har bir foydalanuvchi faqat **o'ziga** |
| `POST /api/v1/attendance/push` | `attendance.manage` | Boshqa birov nomidan (masalan tashqi qurilma integratsiyasi) |
| `GET /api/v1/attendance` | o'zi — kerak emas; boshqalarniki — `attendance.view` | Ro'yxat |

### Billing (Tenant'ning SaaS obunasi) sahifasi
| Endpoint | Permission | Vazifasi |
|---|---|---|
| `GET /api/v1/billing/plans` | `billing.view` | Mavjud tariflar (`starter`/`business`/`enterprise`) |
| `GET /api/v1/billing/subscription` | `billing.view` | Joriy obuna holati |
| `GET /api/v1/billing/usage` | `billing.view` | Storage limit foizi |
| `GET /api/v1/billing/payments` | `billing.view` | To'lovlar tarixi |
| `POST /api/v1/billing/payments/initiate` | `billing.manage` (**2FA**) | Click/Payme orqali to'lovni boshlash — javobdagi URL'ga foydalanuvchi yo'naltiriladi |

`POST /api/v1/billing/webhooks/payme` va `/click` — bularga frontend **hech qachon** murojaat qilmaydi, faqat Payme/Click serverlari chaqiradi.

### Bildirishnomalar (Notifications) sozlamalari sahifasi
| Endpoint | Permission | Vazifasi |
|---|---|---|
| `POST /api/v1/notifications/integrations/telegram` | `notifications.manage` (**2FA**) | Bot token ulash |
| `POST /api/v1/notifications/group-mappings` | `notifications.manage` (**2FA**) | Kategoriya → Telegram guruh bog'lash |
| `POST /api/v1/notifications/messages` | `notifications.manage` (**2FA**) | Qo'lda xabar yuborish |
| `POST /api/v1/notifications/reports/sales-summary` | `notifications.manage` (**2FA**) | PDF savdo hisobotini generatsiya qilib Telegram'ga yuborish |
| `GET /api/v1/notifications/messages`, `/delivery-log` | `notifications.view` | Navbat va yetkazish tarixi (diagnostika uchun) |

### Analytics / Dashboard sahifasi
| Endpoint | Permission | Vazifasi |
|---|---|---|
| `GET /api/v1/analytics/summary` | `analytics.view` | **Bitta chaqiruvda** umumiy xulosa (sotuvlar, yig'ilgan pul, faol mijozlar, top-3 sotuvchi) — asosiy Dashboard sahifasi uchun shu yetarli |
| `GET /api/v1/analytics/leaderboard` | `analytics.view` | To'liq reyting jadvali sahifasi |
| `GET /api/v1/analytics/leaderboard/stream` | `analytics.view` | **SSE** (`EventSource`, oddiy `fetch` emas) — Live Leaderboard uchun real-vaqt yangilanish |
| `GET /api/v1/analytics/course-sales` | `analytics.view` | Turkum/kurs bo'yicha statistika |

Barcha endpoint ixtiyoriy `period_start`/`period_end` query parametrlarini qabul qiladi (bo'lmasa — "bugun", Asia/Tashkent vaqti bo'yicha).

### Live Leaderboard kiosk sahifasi (alohida, parolsiz-email ekran)
`POST /api/v1/dashboard-sessions/login` bilan kirilgach — xuddi shu shakldagi `GET .../leaderboard`, `/leaderboard/stream`, `/course-sales`, `/summary`, lekin `/api/v1/dashboard-sessions/` prefiksi bilan va `period` parametrisiz (har doim "bugun").

### Tashqi CRM integratsiyalar sahifasi (AmoCRM/Bitrix24/Meta Ads)
| Endpoint | Permission | Vazifasi |
|---|---|---|
| `POST /api/v1/crm/integrations/amocrm` \| `/bitrix24` \| `/meta-ads` | `crm.manage` (**2FA**) | Har biri uchun alohida credential shakli |
| `POST /api/v1/crm/customers/{id}/push` | `crm.manage` | Mijozni tashqi CRM'ga qo'lda yuborish |
| `GET /api/v1/crm/leads` | `crm.view` | Sinxronizatsiya tarixi (inbound/outbound) |
| `GET /api/v1/crm/ad-campaigns`, `/ad-insights` | `crm.view` | Meta Ads statistikasi |

### Hisobotlar (Reports) sahifasi — faqat admin
| Endpoint | Permission | Vazifasi |
|---|---|---|
| `GET /api/v1/reports/diagnostics` | `reports.view` | "Muammolar" widgeti — 5 ta tekshiruv natijasi |
| `GET /api/v1/reports/export/{entity}?format=csv\|xlsx` | `reports.export` (**2FA**) | `entity ∈ {customers,sales,finance,calls}` — javob to'g'ridan-to'g'ri fayl (`Content-Disposition: attachment`), frontend uni yuklab olish sifatida ishlaydi (`<a download>` yoki blob) |

### Platform Admin konsoli (`/platform/v1`, alohida ilova/bo'lim — endi Dashboarduz jamoasi uchun ichki vosita, oddiy mijoz frontend'ida ko'rinmaydi)

Platform Admin endi **nazoratchi** — tenant/to'lov holatini kuzatish, muammo bo'lsa qo'lda aralashish. Odatiy tenant/foydalanuvchi hosil bo'lishi endi bu orqali emas, yuqoridagi "0) Ro'yxatdan o'tish"dan o'tadi.

| Endpoint | Vazifasi |
|---|---|
| `GET /platform/v1/tenants` | Barcha tenantlar ro'yxati (`status`, `trial_ends_at` bilan — trial qachon tugashini shu yerdan ko'rasiz) |
| `POST /platform/v1/tenants` + `.../admin-user` | Yordamchi/qo'lda yo'l — pastdagi "Platform-Admin-provisioned" bo'limiga qarang |
| `GET /platform/v1/billing/plans`, `PATCH /platform/v1/billing/plans/{code}` | SaaS tariflarini narx/limit bo'yicha tahrirlash |
| `GET/POST /platform/v1/tenants/{id}/subscription`, `/invoices` | Tenant obunasi/hisob-fakturalarini qo'lda boshqarish |
| `POST /platform/v1/tenants/{id}/storage/recalculate` | Storage limitni qayta hisoblash |
| `POST /platform/v1/billing/dunning/run` | To'lov qilmagan (`past_due→grace→suspended`) **va trial muddati tugagan** (`trial→suspended`, `trial_ends_at` asosida) tenant'larni holatini yangilash — hozircha real cron emas, qo'lda yoki tashqi scheduler (masalan VPS crontab) orqali kunlik chaqiriladi |
| `GET /platform/v1/audit-logs` | Platform Admin'ning tenant ma'lumotiga har bir tegishi (audit) |

## API'lar orasidagi bog'liqlik — qisqa xulosa

```
Register (identifier tasdiqlash) ──> Tenant + Roles (avtomatik seed) + birinchi Admin User ──> auto-login (TokenPair)
                                                                                                       │
Roles/Permissions ──┐                                                                                 │
                     ├──> Users (role_id) ──┐ <──────────────────────────────────────────────────────┘
Catalog (daraxt) ────┤                       ├──> Sales (customer_id, catalog_category_id, responsible_user_id)
Customers ───────────┘                       │        │
                                              │        ├──> Finance/Payments (sale_id)
                                              │        ├──> Finance/AdjustmentRequests (sale_id) ──> approve ──> Sales'ni yangilaydi / Refund yozadi
                                              │        └──> Sale changes tarixi
                                              │
                                              └──> Finance/BonusPlans (role_id, USER emas) ──> Payroll/calculate

Calls integrations + Manager mappings ──> (webhook, avtomatik) ──> Calls ro'yxati ──> Recording URL

Billing (tenant o'zi) ──ajratilgan──> Finance (mijoz to'lovlari) — ikkalasi ham "to'lov" so'zini ishlatadi, lekin butunlay boshqa narsa

CRM integrations ──> (webhook, avtomatik) ──> Customers (yangi lead) + CRM leads tarixi

Analytics/summary ──o'qiydi──> Sales + Finance + Customers (agregatsiya, alohida yozuv yo'q)

Reports/diagnostics ──o'qiydi──> Sales + Finance + webhook_events + notification_outbox (faqat diagnostika, hech narsa o'zgartirmaydi)
```
