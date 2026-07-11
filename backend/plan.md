# Dashboarduz — qolgan dashboard bo'limlari uchun reja

Maqsad: `untitled-tizimliy` frontend'ini `WebstormProjects\dashboarduz` (eski Next.js prototip) darajasidagi to'liq sidebar/sahifa tarkibiga yetkazish, lekin **Tzmliy'ning o'z dizaynida** va **haqiqiy FastAPI backend'imizga** ulangan holda. Hisob-kitoblarning barchasi backendda (`service.py`/`repository.py`) qoladi — frontend faqat REST API chaqirib, tayyor natijani ko'rsatadi. Bu reja allaqachon qurilgan narsalarni takrorlamaydi (Auth, Dashboard/Analytics, Sales, Customers — tayyor).

Har bir faza backend audit bilan boshlanadi (ko'pchilik endpoint allaqachon mavjud, faqat frontend yo'q), so'ng frontend API client + UI, so'ng real VPS orqali sinov bilan tugaydi. Fazalar ketma-ket bajariladi: A → B → C → D.

## Umumiy backend gap (barcha fazalarga ta'sir qiladi)

**2FA yoqish UI frontendda yo'q.** `finance.manage`, `finance.approve`, `calls.manage`, `crm`/`notifications` integratsiya endpoint'larining aksariyati `PRIVILEGED_PERMISSIONS` ro'yxatida — ya'ni ular ishlashi uchun foydalanuvchida 2FA yoqilgan bo'lishi shart (`core/deps.py`ning `require_permission`i tekshiradi). Backend endpoint'lari (`POST /auth/2fa/setup`, `POST /auth/2fa/confirm`) tayyor, frontendda esa sahifa yo'q. **Faza A boshida hal qilinadi** — undan keyingi fazalar shunga tayanadi.

---

## Faza A — Moliya (Finance)

### Backend (tayyor, mavjud endpoint'lar — `app/modules/finance/router.py`)
- `POST /api/v1/finance/payments` — to'lov qabul qilish (`finance.manage`, Idempotency-Key, 2FA talab qiladi)
- `GET /api/v1/finance/payments/{sale_id}`, `GET /api/v1/finance/payments/{sale_id}/ledger` (`finance.view`)
- `POST/GET /api/v1/finance/adjustment-requests` + `/approve`, `/reject` (yaratish `sales.manage`, tasdiqlash `finance.approve`, 2FA)
- `POST/GET /api/v1/finance/bonus-plans` (`finance.manage`/`finance.view`)
- `POST /api/v1/finance/payroll/calculate`, `GET /api/v1/finance/payroll` (`finance.manage`/`finance.view`)

Backend'da yangi kod kerak emas — faqat frontend integratsiyasi.

**✅ Audit natijasi (real VPS'da, HTTP qatlamidan mustaqil, to'g'ridan-to'g'ri `service.py` funksiyalarini chaqirib tekshirildi — `alijahom2` tenant, real ma'lumotlar ustida):**
- `setup_2fa` → `confirm_2fa`: TOTP secret to'g'ri generatsiya bo'ldi, real kod bilan tasdiqlash ishladi, `totp_enabled=true` bo'ldi
- `record_payment`: ledger balansi to'lov summasiga aniq mos kamaydi (2 500 000 → 2 000 000)
- Idempotency-Key: bir xil kalit bilan qayta chaqirilganda **xuddi shu** to'lov qaytarildi, dublikat yaratmadi
- `create_bonus_plan` + `calculate_payroll`: komissiya matematikasi to'g'ri (`bonus = base * commission_bps / 10000`, USD va UZS ikkalasida ham)
- Test uchun yaratilgan barcha yozuvlar (to'lovlar, bonus reja, payroll) va yoqilgan 2FA orqaga qaytarildi — tenant holati tekshiruvdan oldingi holatga tiklandi.

**Muhim frontend detali (audit paytida aniqlandi):** `confirm_2fa` muvaffaqiyatli bo'lgach, joriy access token hali eski (`totp_enabled: false`) bo'lib qoladi — bu claim faqat token yangilanganda (refresh) qayta o'qiladi (`_issue_token_pair` har safar DB'dan `totp_enabled`ni qayta oladi). **Shuning uchun 2FA sahifasi tasdiqlangandan so'ng frontend albatta `tenantAuthStore`ning refresh-oqimini qayta chaqirishi kerak** (localStorage'dagi refresh_token bilan `POST /auth/refresh`), aks holda foydalanuvchi 2FA yoqilganini ko'radi-yu, lekin `finance.manage` kabi amallar hali ham 403 qaytaraveradi to full login/refresh bo'lgunga qadar.

### Frontend ishlari
1. **Sozlamalar → 2FA yoqish sahifasi** (`/dashboard/settings/2fa`): `setup_2fa` → QR kod (`otpauth_uri`) ko'rsatish → kod kiritib `confirm_2fa`. Sidebar'ga "Sozlamalar" bandi qo'shiladi.
2. `lib/api/finance.ts` — payments, ledger, adjustment-requests, bonus-plans, payroll klientlari.
3. Sales sahifasidagi har bir savdo qatoriga: ledger balansi (`GET .../ledger`) + "To'lov qabul qilish" formasi (summa, valyuta, usul).
4. Yangi **"Moliya"** sahifa (`/dashboard/finance`, `finance.view` egalariga sidebar'da ko'rinadi):
   - Bonus rejalar: ro'yxat + yaratish formasi (nom, rol, komissiya %, muddat)
   - Payroll: davr tanlab hisoblash tugmasi + natijalar ro'yxati
   - Adjustment-requests: kutilayotgan so'rovlar ro'yxati, `finance.approve` egalari uchun tasdiqlash/rad etish tugmalari
5. 403 (2FA yo'q) holatini `RegisterPlanView`dagi kabi aniq xabar bilan ko'rsatish, 2FA sahifasiga havola bilan.

### Quriladigan API funksiyalar

`lib/api/auth2fa.ts` (yoki mavjud `tenantAuth.ts`ga qo'shiladi):
| Funksiya | Backend | Vazifa |
|---|---|---|
| `setup2fa(token)` | `POST /auth/2fa/setup` | `{secret, otpauth_uri}` qaytaradi — QR kod shu URI'dan chiziladi |
| `confirm2fa(token, code)` | `POST /auth/2fa/confirm` | Autentifikator ilovadan olingan kodni tasdiqlab, `totp_enabled=true` qiladi (204) |

`lib/api/finance.ts`:
| Funksiya | Backend | Vazifa |
|---|---|---|
| `recordPayment(token, {sale_id, amount, currency, method})` | `POST /finance/payments` (Idempotency-Key) | Savdoga naqd/karta/click/payme to'lovini qayd qiladi |
| `listPayments(token, saleId)` | `GET /finance/payments/{sale_id}` | Bitta savdoning barcha to'lovlari tarixi |
| `getSaleLedger(token, saleId)` | `GET /finance/payments/{sale_id}/ledger` | `{entries[], balance}` — savdoning joriy qarzi/qoldig'i |
| `createAdjustmentRequest(token, {sale_id, type, payload})` | `POST /finance/adjustment-requests` (Idempotency-Key) | Refund yoki tarif-o'zgartirish so'rovi ochadi (`sales.manage` kerak) |
| `listAdjustmentRequests(token, statusFilter?)` | `GET /finance/adjustment-requests` | Kutilayotgan/ko'rib chiqilgan so'rovlar ro'yxati |
| `approveAdjustmentRequest(token, id, {version, review_reason})` | `POST /finance/adjustment-requests/{id}/approve` (Idempotency-Key) | So'rovni tasdiqlaydi — refund yozuvi yoki tarif o'zgarishi avtomatik qo'llanadi |
| `rejectAdjustmentRequest(token, id, {version, review_reason})` | `POST /finance/adjustment-requests/{id}/reject` (Idempotency-Key) | So'rovni rad etadi, sababini yozadi |
| `createBonusPlan(token, {name, applies_to_role_id, commission_bps, effective_from, effective_to?})` | `POST /finance/bonus-plans` (Idempotency-Key) | Rol uchun komissiya foizi (basis point) va amal qilish muddatini belgilaydi |
| `listBonusPlans(token)` | `GET /finance/bonus-plans` | Mavjud bonus rejalar ro'yxati |
| `calculatePayroll(token, {period_start, period_end, user_id?})` | `POST /finance/payroll/calculate` | Davr uchun har bir xodimning maosh+bonusini hisoblab, yozib qo'yadi (idempotent upsert) |
| `listPayrollEntries(token, userId?)` | `GET /finance/payroll` | Hisoblangan payroll yozuvlari ro'yxati |

### Sahifa dizayni va animatsiya

**`/dashboard/settings/2fa`** (`AuthCard`ga o'xshash, lekin dashboard ichida — `glass-card` markazda, `max-w-[440px]`):
- 1-qadam: "2FA yoqish" tugmasi → `setup2fa` chaqiriladi → QR kod (`otpauth_uri`dan, `qrcode` yoki shunga o'xshash kichik kutubxona bilan chizamiz — yangi dependency, birinchi marta) + qo'lda kiritish uchun `secret` matn ko'rinishida, "nusxalash" tugmasi bilan.
- 2-qadam: `OtpCodeInput` (mavjud komponent, Register/Login flow'da ishlatilgan) — 6 xonali kod, `confirm2fa`ga yuboriladi.
- Muvaffaqiyat holati: yashil `CheckCircle2` ikonka + "2FA yoqildi" xabari (`ForgotPasswordView`ning "sent" holatiga o'xshash pattern) — `auth-card-enter` animatsiyasi bilan paydo bo'ladi (`theme.css`da mavjud).
- Xato: `FormField`dagi kabi qizil matn, qayta urinish imkoniyati bilan.

**Sales sahifasidagi to'lov/ledger** (`SalesPage.tsx`ga qo'shimcha):
- Har bir savdo qatori bosilganda (yoki alohida "Balans" tugmasi) — `Kanban`/`CallLog` mockuplarida ishlatilgan `bg-background/60 rounded-xl border` uslubidagi kichik akkordion ochiladi: ledger yozuvlari ro'yxati (charge/payment, sana, summa — ijobiy/manfiy rangda: charge oltin, payment yashil) + pastda **balans** (qalin, katta shrift, `text-primary` agar balans>0 bo'lsa "qarzdor", `text-success` agar 0 bo'lsa "to'liq to'langan").
- "To'lov qabul qilish" — `CustomersPage`dagi "Yangi mijoz" formasi bilan bir xil pattern: tugma bosilganda `glass-card` forma ochiladi (summa, valyuta select, usul select: naqd/karta/click/payme), submit `toast.success`.
- **Hisob-kitob manbai:** balans va yozuvlar 100% `GET .../ledger` javobidan (`{entries[], balance}`) — frontend hech narsani qo'shmaydi/ayirmaydi, faqat `formatMoney` bilan formatlaydi.

**`/dashboard/finance`** — `Tabs` komponenti (mavjud, `LoginView`da ishlatilgan) bilan 3 bo'lim:
1. **Bonus rejalar** — kartochkalar grid (`grid-cols-1 sm:grid-cols-2`), har biri rol nomi + komissiya foizi (`commission_bps / 100`%) + muddat. "Yangi reja" formasi (rol select — `listRoles`dan, foiz input, sana range).
2. **Payroll** — davr tanlash (ikkita sana input) + "Hisoblash" tugmasi (`gold` variant, `Loader2` spinner bosilganda) → natija jadvali: xodim, asosiy summa, bonus summa, jami (**hisob-kitob manbai:** `base_amount`/`bonus_amount` to'g'ridan-to'g'ri `PayrollEntryOut`dan, jami = shu ikkisining frontendda oddiy qo'shilishi — bu aggregatsiya emas, faqat ko'rsatish uchun bitta qatorda birlashtirish, xuddi "narx + soliq = jami" ko'rsatish kabi UI qulayligi).
3. **Adjustment so'rovlar** — status bo'yicha rangli badge (`pending`=oltin, `approved`=yashil, `rejected`=qizil), `finance.approve` egalari uchun har bir `pending` qatorda "Tasdiqlash"/"Rad etish" tugmalari — bosilganda **tasdiqlash modali** chiqadi (pul harakati bo'lgani uchun ikki bosqichli himoya: tasodifiy bosishdan saqlaydi), sabab kiritish maydoni ixtiyoriy.
- Bo'sh holatlar uchun mavjud pattern: ikonka + sarlavha + tavsif (`DashboardPage`ning `noData` bloki kabi).
- Barcha kartalar `hover:-translate-y-1` yengil animatsiya (Sales/Customers sahifalarida ishlatilgan pattern bilan izchil).

**403 (2FA yo'q) holati:** har uch joyda (to'lov, bonus, payroll) bir xil ogohlantirish komponenti — `border-primary/25 bg-primary/8` rangli banner, "2FA yoqish kerak" matni + `/dashboard/settings/2fa`ga havola (`RegisterPlanView.need2fa` xabaridan ilhomlangan, lekin endi haqiqiy hal qiluvchi havola bilan).

### Sinov
Real VPS'dagi `+998900290446` tenant'i (`alijahom2`, savdolari bor) orqali: 2FA yoqish → savdoga to'lov qabul qilish → ledger balansini tekshirish → bonus reja yaratish → payroll hisoblash.

---

## Faza B — Sotuvchilar + Foydalanuvchilar/Rollar

### Backend (tayyor — `app/modules/auth/users_router.py`, `roles_router.py`)
- `POST/GET /api/v1/users`, `PATCH /users/{id}/role`, `PATCH /users/{id}/deactivate` (`users.manage`/`users.view`, 2FA)
- `GET /api/v1/permissions` — to'liq ruxsat katalogi
- `POST/GET /api/v1/roles`, `PATCH /roles/{id}/permissions` (`roles.manage`, 2FA)

Backend'da yangi kod kerak emas.

**⚠️ Audit paytida topilgan reja xatosi:** yuqoridagi endpoint'lar avval noto'g'ri `/api/v1/auth/...` prefiksi bilan yozilgan edi — `users_router.py`ning haqiqiy prefiksi `/api/v1/users` (`/auth` yo'q), `roles_router.py`niki esa `/api/v1` (yo'llar: `/api/v1/permissions`, `/api/v1/roles`). `main.py`da ikkalasi ham qo'shimcha prefikssiz ulanadi. Xuddi shu turdagi xato Faza A'da `finance.ts`ning `listRolesForSelect`ida ham topilgan edi (o'sha safar ham `/auth/roles` deb yozilgan, to'g'risi `/roles`) — bu ikkinchi marta takrorlanishi shuni ko'rsatadiki, kelajakda har doim `grep -n "APIRouter(prefix"` orqali haqiqiy prefiksni frontend yozishdan oldin tekshirish kerak, hujjatga (yoki xotiraga) ishonib qolmasdan.

### Frontend ishlari
1. `lib/api/users.ts`, `lib/api/roles.ts`.
2. **"Foydalanuvchilar"** sahifa (`/dashboard/users`, `users.view`): ro'yxat (ism, email/telefon, rol, holat), "Xodim qo'shish" formasi, rol o'zgartirish, deaktivatsiya.
3. **"Rollar"** sahifa (`/dashboard/roles` yoki Sozlamalar ichida, `roles.view`): mavjud rollar + ruxsatlar, yangi custom rol yaratish (checkbox ro'yxati `GET /permissions` asosida).
4. **"Sotuvchilar"** sahifa — `GET /auth/users` + `GET /analytics/leaderboard` natijalarini frontendda birlashtirib, har bir xodimning savdo statistikasini ko'rsatish (backend'da alohida "combined" endpoint yo'q — hozircha ikkita chaqiruvni frontendda birlashtiramiz; kelajakda kerak bo'lsa backend'ga qo'shish mumkin).

### Quriladigan API funksiyalar

`lib/api/users.ts`:
| Funksiya | Backend | Vazifa |
|---|---|---|
| `createUser(token, {email, password, role_id, phone?})` | `POST /auth/users` | Yangi xodim qo'shadi (**email majburiy** — self-registratsiyadan farqli, `UserCreate.email: EmailStr`) |
| `listUsers(token)` | `GET /auth/users` | Tenant'dagi barcha xodimlar ro'yxati (ism, email/telefon, rol, holat) |
| `updateUserRole(token, userId, {role_id})` | `PATCH /auth/users/{id}/role` | Xodimning rolini almashtiradi |
| `deactivateUser(token, userId)` | `PATCH /auth/users/{id}/deactivate` | Xodimni faolsizlantiradi (kirish huquqini yopadi) |

`lib/api/roles.ts`:
| Funksiya | Backend | Vazifa |
|---|---|---|
| `listPermissions(token)` | `GET /auth/permissions` | Tizimdagi barcha ruxsat kalitlari ro'yxati (checkbox forma uchun) |
| `createRole(token, {name, permissions[]})` | `POST /auth/roles` | Custom rol yaratadi, tanlangan ruxsatlar bilan |
| `listRoles(token)` | `GET /auth/roles` | Mavjud rollar (tizim + custom) va ularning ruxsatlari |
| `updateRolePermissions(token, roleId, {permissions[]})` | `PATCH /auth/roles/{id}/permissions` | Mavjud rolning ruxsatlar to'plamini yangilaydi |

Sotuvchilar sahifasi alohida API fayl talab qilmaydi — mavjud `listUsers` + `analyticsApi.getLeaderboard` natijalarini `user_id` bo'yicha frontendda birlashtiradi.

### Sahifa dizayni va animatsiya

**`/dashboard/users`** — `CustomersPage.tsx` bilan bir xil ro'yxat-pattern (avatar-inisial doira, ism, pastida email/telefon, o'ngda rol nomi rangli badge sifatida — har bir rolga barqaror rang: `admin`=oltin, `manager`=ko'k, `agent`=yashil, `finance`=binafsha, custom rollar uchun rol nomidan hash qilingan rang).
- Nofaol xodimlar ro'yxat oxirida, xiraroq (`opacity-50`) ko'rsatiladi, "Nofaol" badge bilan.
- "Xodim qo'shish" formasi — `CustomersPage`dagi forma pattern: email (majburiy), parol (`PasswordStrengthMeter` komponenti qayta ishlatiladi — Register oqimida allaqachon bor), rol select (`listRoles`dan), telefon (ixtiyoriy).
- Rol o'zgartirish — qatordagi rol badge'ini bosganda kichik dropdown ochiladi (inline, modal emas — tezkor amal).
- Deaktivatsiya — "..." menyu ichida, `AlertDialog`ga o'xshash tasdiqlash so'raladi (yangi kichik `ConfirmDialog` komponenti kerak bo'ladi, chunki bu qaytarib bo'lmaydigan amal).

**`/dashboard/roles`** — chap tomonda rollar ro'yxati (vertikal, `DashboardSidebar`ning ichki nav pattern'iga o'xshash), o'ngda tanlangan rolning ruxsatlari — `listPermissions`dan kelgan kalitlar modul bo'yicha guruhlangan checkbox'lar (`sales.*`, `finance.*`, `customers.*` va h.k. — kalit prefiksiga qarab frontendda guruhlanadi, bu ham hisob-kitob emas, faqat satrni `.` bo'yicha bo'lib guruh sarlavhasini olish). Tizim rollari (`is_system=true`) uchun checkbox'lar o'chirilgan (`disabled`), faqat custom rollar tahrirlanadi. O'zgarish saqlanganda `toast.success`.

**"Sotuvchilar"** sahifa (`/dashboard/sellers` yoki mavjud Analytics ichiga qo'shimcha tab) — `LiveLeaderboard`ning kengaytirilgan versiyasi: har bir xodim uchun avatar + ism + davr bo'yicha savdo soni/summasi (**hisob-kitob manbai:** to'g'ridan-to'g'ri `LeaderboardEntry.sales_count`/`total_amount`, frontend faqat `listUsers`dan olingan email/rol bilan `user_id` orqali birlashtiradi — bu join, aggregatsiya emas). 1-o'rin uchun oltin gradient doira (mavjud `DashboardPage`/`LiveLeaderboard`dagi pattern bilan bir xil).

### Sinov
Yangi xodim qo'shish → unga rol biriktirish → custom rol yaratib ruxsat berish → Sotuvchilar sahifasida statistikasini ko'rish.

---

## Faza C — Qo'ng'iroqlar + Davomat

### Backend (tayyor — `app/modules/calls/router.py`, `attendance/router.py`)
- `GET /api/v1/calls/calls`, `GET /calls/calls/{id}/recording` (`calls.view`)
- `POST/GET /api/v1/calls/integrations`, `/manager-mappings` (`calls.manage`, 2FA — webhook maxfiy kalitlari)
- `POST /api/v1/attendance/check-in`, `/check-out` (ruxsatsiz, faqat o'zi uchun), `GET /attendance` (`attendance.view` boshqalarniki uchun)

Backend'da yangi kod kerak emas.

### Frontend ishlari
1. `lib/api/calls.ts`, `lib/api/attendance.ts`.
2. **"Qo'ng'iroqlar"** sahifa: jurnal (raqam, davomiylik, menejer), yozuvni tinglash (`recording` presigned URL).
3. **"Davomat"** sahifa: o'zining check-in/check-out tugmasi (hamma uchun), `attendance.view` egalari uchun butun jamoa davomati jadvali.
4. `calls.manage` egalari uchun: UTEL integratsiya sozlamalari formasi (webhook secret, manager mapping) — 2FA talab qiladi.

### Quriladigan API funksiyalar

`lib/api/calls.ts`:
| Funksiya | Backend | Vazifa |
|---|---|---|
| `listCalls(token)` | `GET /calls/calls` | Qo'ng'iroqlar jurnali (raqam, yo'nalish, davomiylik, holat, menejer) |
| `getRecordingUrl(token, callId)` | `GET /calls/calls/{id}/recording` | Yozuvni tinglash uchun qisqa muddatli presigned URL qaytaradi |
| `createIntegration(token, {provider, webhook_secret, api_key?})` | `POST /calls/integrations` | UTEL/Мои звонки webhook maxfiy kalitini ulaydi (`calls.manage`, 2FA) |
| `listIntegrations(token)` | `GET /calls/integrations` | Ulangan integratsiyalar holati |
| `createManagerMapping(token, {provider, external_agent_id, user_id})` | `POST /calls/manager-mappings` | Provayderdagi agent ID'ni tizimdagi xodimga bog'laydi |
| `listManagerMappings(token)` | `GET /calls/manager-mappings` | Mavjud bog'lanishlar ro'yxati |

`lib/api/attendance.ts`:
| Funksiya | Backend | Vazifa |
|---|---|---|
| `checkIn(token)` | `POST /attendance/check-in` | O'zini ishga kelgan deb belgilaydi (ruxsatsiz — har bir xodim o'zi uchun) |
| `checkOut(token)` | `POST /attendance/check-out` | O'zining ochiq check-in yozuvini yopadi |
| `listAttendance(token)` | `GET /attendance` | Davomat yozuvlari (`attendance.view` — boshqalarnikini ko'rish uchun) |

### Sahifa dizayni va animatsiya

**`/dashboard/calls`** — `CallLogMockup` (landing sahifada allaqachon qurilgan dizayn tili) ning haqiqiy ma'lumotli versiyasi: har bir qatorda yo'nalish ikonkasi (kiruvchi/chiquvchi — o'ngga/chapga strelka), telefon raqami, davomiylik (`mm:ss`, **hisob-kitob manbai:** `duration_seconds`ni frontendda faqat formatlash, backend hisoblagan), holat badge (`answered`=yashil, `missed`=qizil, xuddi FeatureShowcase'dagi kabi). Qatorni bosganda — pastda ochiladigan panelda `<audio controls src={recording_url}>` (URL `getRecordingUrl`dan, faqat bosilganda so'raladi — presigned URL muddati cheklangani uchun oldindan yuklab qo'yilmaydi).
- Filtrlar (sana, holat) — `PricingSection`dagi valyuta toggle pattern'iga o'xshash pill-tugmalar qatori.

**`/dashboard/attendance`**:
- Sahifa tepasida — o'zining holati: katta "Ishga keldim" / "Ishdan ketdim" tugmasi (holatga qarab rangi almashadi — hali check-in qilmagan bo'lsa `gold`, ochiq check-in bo'lsa `outline` + yashil "hozir ishda" indikatori, `HeroSection`dagi pulslovchi nuqta pattern'i bilan).
- Pastda — jamoa jadvali (`attendance.view` bo'lsa): ism, kelgan vaqt, ketgan vaqt, **ishlagan vaqt** (kelgan-ketgan farqi — bu ham frontendda oddiy `Date` ayirish, moliyaviy hisob-kitob emas, faqat vaqt ko'rsatish, xuddi "necha daqiqa oldin" ko'rsatish kabi UI hisoblash).

**Integratsiya formalari** (`calls.manage`) — Sozlamalar ichida alohida bo'lim, Faza D'dagi integratsiya kartochkalari bilan bir xil vizual pattern (pastga qarang) ishlatiladi.

### Sinov
Real qo'ng'iroq ma'lumoti yo'qligi sababli — mock/qo'lda SQL orqali test qo'ng'iroq yozuvi qo'shib UI'ni tekshirish (VPS'ga tegmasdan, faqat ko'rinishni tasdiqlash uchun).

---

## Faza D — Integratsiyalar (CRM / Telegram)

### Backend (tayyor — `app/modules/crm/router.py`, `notifications/router.py`)
- `POST /api/v1/crm/integrations/amocrm|bitrix24|meta-ads` (`crm.manage`, 2FA)
- `GET /api/v1/crm/leads`, `/ad-campaigns`, `/ad-insights` (`crm.view`)
- `POST/GET /api/v1/notifications/integrations/telegram`, `/group-mappings` (`notifications.manage`, 2FA)
- `POST/GET /api/v1/notifications/messages`, `GET /delivery-log` (`notifications.manage`/`.view`)

Backend'da yangi kod kerak emas.

### Frontend ishlari
1. `lib/api/crm.ts`, `lib/api/notifications.ts`.
2. **"Integratsiyalar"** sahifa: AmoCRM / Bitrix24 / Meta Ads ulash formalari, Telegram bot token + guruh mapping.
3. **"Bildirishnomalar"** sahifa: yuborilgan xabarlar tarixi + yetkazish holati (`delivery-log`).

### Quriladigan API funksiyalar

`lib/api/crm.ts`:
| Funksiya | Backend | Vazifa |
|---|---|---|
| `configureAmoCrm(token, {subdomain, api_token, webhook_secret})` | `POST /crm/integrations/amocrm` | AmoCRM hisobini ulaydi (`crm.manage`, 2FA) |
| `configureBitrix24(token, {webhook_base_url, application_token})` | `POST /crm/integrations/bitrix24` | Bitrix24 incoming-webhook orqali ulaydi |
| `configureMetaAds(token, {ad_account_id, access_token})` | `POST /crm/integrations/meta-ads` | Meta Ads hisobini (uzoq muddatli System User token) ulaydi |
| `listLeads(token)` | `GET /crm/leads` | Tashqi CRM'dan sinxronlangan lidlar tarixi |
| `listAdCampaigns(token)` | `GET /crm/ad-campaigns` | Meta Ads kampaniyalari ro'yxati |
| `listAdInsights(token)` | `GET /crm/ad-insights` | Kampaniya bo'yicha kunlik ko'rsatish/bosish/xarajat statistikasi |

`lib/api/notifications.ts`:
| Funksiya | Backend | Vazifa |
|---|---|---|
| `configureTelegramBot(token, {bot_token})` | `POST /notifications/integrations/telegram` | Tenant'ning o'z Telegram bot tokenini ulaydi (`notifications.manage`, 2FA) |
| `getTelegramStatus(token)` | `GET /notifications/integrations/telegram` | `{configured: bool}` — bot ulanganmi yo'qmi |
| `createGroupMapping(token, {category_id?, telegram_chat_id, label})` | `POST /notifications/group-mappings` | Katalog kategoriyasini Telegram guruhiga bog'laydi (xabar yo'naltirish uchun) |
| `listGroupMappings(token)` | `GET /notifications/group-mappings` | Mavjud guruh bog'lanishlari |
| `sendMessage(token, {category_id?, text})` | `POST /notifications/messages` | Bog'langan guruhga xabar navbatiga qo'yadi |
| `sendSalesSummaryReport(token, {category_id?, period_start, period_end})` | `POST /notifications/reports/sales-summary` | Davr uchun PDF savdo hisobotini generatsiya qilib, Telegram'ga yuboradi |
| `listMessages(token)` | `GET /notifications/messages` | Chiquvchi xabarlar navbati va ularning holati |
| `listDeliveryLog(token)` | `GET /notifications/delivery-log` | Har bir yuborish urinishining tarixi (muvaffaqiyat/xato) |

### Sahifa dizayni va animatsiya

**`/dashboard/integrations`** — `IntegrationsSection`dagi (landing) rangli belgi-kvadrat pattern'i takrorlanadi, lekin endi funksional kartochka sifatida: AmoCRM / Bitrix24 / Meta Ads / Telegram — har biri o'z brend rangida ikonka + nom + holat ("Ulanmagan" kulrang / "Ulangan" yashil nuqta bilan). Bosilganda forma ochiladi (token/webhook maydonlari, `type="password"` kabi yashiringan holda, "ko'rsatish" ko'z-ikonkasi bilan — `LoginView`dagi parol maydoni pattern'i). Muvaffaqiyatli ulanganda kartochka holati darhol yangilanadi + `toast.success`.
- Bu sahifa `calls.manage` (UTEL/Мои звонки) bilan ham bo'lishiladi — bitta "Integratsiyalar" sahifasida barcha provayderlar (calls + CRM + Telegram) bir joyda, tab yoki bo'lim sarlavhalari bilan ajratilgan.

**`/dashboard/notifications`** — `SalesPage`/`CustomersPage` ro'yxat pattern'i: har bir xabar qatori — matn qisqartirilgan holda, holat badge (`pending`=oltin, `sent`=yashil, `failed`/`dead_letter`=qizil), yuborilgan vaqt. Qatorni bosganda `delivery-log`dan shu xabarning barcha urinishlari (necha marta qayta urinilgani, xatolar) ko'rsatiladi — bu ham faqat ro'yxatni filtrlash, hisob-kitob emas.
- Guruh mappinglari — kichik jadval (kategoriya nomi → Telegram chat ID → label), "Yangi bog'lash" formasi.

**Umumiy integratsiya-forma dizayni** (Faza C + D'da qayta ishlatiladi): bitta `IntegrationCard` komponenti — props: `icon`, `brandColor`, `name`, `status`, `fields[]`, `onSubmit`. Bir marta yaxshi qilib qurilsa, barcha provayderlar (UTEL, AmoCRM, Bitrix24, Meta Ads, Telegram) shu bitta komponentdan foydalanadi — kod takrorlanmaydi.

### Sinov
Haqiqiy tashqi hisob (AmoCRM/Telegram bot) bo'lmagani sababli — forma validatsiyasi va xato holatlarini (noto'g'ri token va h.k.) tekshirish bilan cheklaymiz.

---

## Faza E — Katalog + Course sales + Hisobotlar/diagnostika

Faza A-D "asosiy 4 faza" deb tanlangan edi, lekin eski Next.js prototip bilan solishtirilganda (2026-07-11) uchta sahifa hech qaysi fazada yo'q ekani aniqlandi, holbuki backend'lari allaqachon tayyor edi: katalog (mahsulot/xizmat ierarxiyasi) boshqaruvi, kategoriya bo'yicha savdo statistikasi ("course sales"), va moliyaviy/operatsion diagnostika + eksport. Foydalanuvchi "reja bo'yicha barcha kerakli narsalar qilinishi kerak" deb aniq so'ragani uchun bu uchtasi Faza E sifatida qo'shildi — E ham A-D bilan bir xil backend-audit → frontend tartibiga bo'ysunadi.

**Muhim bog'liqlik:** `SalesPage.tsx`ning "Yangi savdo" formasi hozirgacha `catalog_category_id`ni hech qachon o'rnatmagan (backend maydon qabul qiladi, frontend hech qachon yubormagan) — demak courses-sales statistikasi katalog UI qurilib, forma unga ulanmaguncha har doim bo'sh qaytadi. Shuning uchun katalog UI + SalesPage formasiga kategoriya picker qo'shish, course-sales sahifasining **haqiqiy ishlashi uchun shart**, ixtiyoriy emas.

### Backend (tayyor — `app/modules/catalog/router.py`, `analytics/router.py`, `reports/router.py`)
- `POST/GET /api/v1/catalog/categories`, `PATCH /categories/{id}`, `DELETE /categories/{id}` (`catalog.manage`/`catalog.view`) — `GET` butun daraxtni bitta so'rovda qaytaradi (`CategoryNode.children`, ichma-ich nested).
- `GET /api/v1/analytics/course-sales?period_start&period_end` (`analytics.view`) — `CategorySalesEntryOut[]`: har bir kategoriya+valyuta uchun `sales_count`/`total_amount`.
- `GET /api/v1/reports/diagnostics` (`reports.view`) — beshta fiksirlangan tekshiruv natijasi bitta obyektda: `sales_without_charge_entry`, `stale_pending_adjustment_requests`, `negative_balance_sales`, `webhook_events_backlog`, `notification_outbox_backlog`.
- `GET /api/v1/reports/export/{entity}?format=csv|xlsx` (`reports.export`, 2FA — privileged) — `entity` ∈ `customers|sales|finance|calls`, javob fayl sifatida qaytadi (`Content-Disposition: attachment`), frontend uni blob qilib yuklab olishi kerak.

Backend'da yangi kod kerak emas.

### Frontend ishlari
1. `lib/api/catalog.ts`, `lib/api/reports.ts`; `lib/api/analytics.ts`ga `getCourseSales` qo'shiladi.
2. **"Katalog"** sahifa (`/dashboard/catalog`, `catalog.view`): daraxt ko'rinishi (ichma-ich accordion, cheksiz chuqurlik), har bir tugunga "+ bo'lim qo'shish" va nomini tahrirlash, bo'sh tugunni o'chirish (`catalog.manage`).
3. **`SalesPage.tsx`ning "Yangi savdo" formasiga** kategoriya picker qo'shiladi (ixtiyoriy select, katalog daraxtidan flat ro'yxat — `listCategories` javobini frontendda tekshiib bir marta flatten qilamiz, bu ham hisob-kitob emas, faqat daraxtni ro'yxatga aylantirish).
4. **"Course sales"** sahifa (`/dashboard/course-sales`, `analytics.view`): davr tanlash + kategoriya bo'yicha savdo statistikasi kartochkalari.
5. **"Hisobotlar"** sahifa (`/dashboard/reports`, `reports.view`): beshta diagnostika bloki + eksport tugmalari (`reports.export`, 2FA talab qiladi).

### Quriladigan API funksiyalar

`lib/api/catalog.ts`:
| Funksiya | Backend | Vazifa |
|---|---|---|
| `listCategories(token)` | `GET /catalog/categories` | Butun kategoriya daraxtini (nested `children`) qaytaradi |
| `createCategory(token, {name, parent_id?})` | `POST /catalog/categories` | Yangi bo'lim qo'shadi (root yoki biror tugunning farzandi) |
| `updateCategory(token, id, {name})` | `PATCH /catalog/categories/{id}` | Bo'lim nomini o'zgartiradi |
| `deleteCategory(token, id)` | `DELETE /catalog/categories/{id}` | Bo'sh (farzandsiz) bo'limni o'chiradi — farzandi bo'lsa 409 |

`lib/api/analytics.ts` (qo'shimcha funksiya):
| Funksiya | Backend | Vazifa |
|---|---|---|
| `getCourseSales(token, periodStart?, periodEnd?)` | `GET /analytics/course-sales` | Davr uchun kategoriya+valyuta bo'yicha savdo soni/summasi |

`lib/api/reports.ts`:
| Funksiya | Backend | Vazifa |
|---|---|---|
| `getDiagnostics(token)` | `GET /reports/diagnostics` | Beshta moliyaviy/operatsion anomaliya ro'yxatini bitta obyektda qaytaradi |
| `exportEntity(token, entity, format)` | `GET /reports/export/{entity}` | CSV/XLSX faylni blob sifatida qaytaradi, frontend uni yuklab beradi |

### Sahifa dizayni va animatsiya

**`/dashboard/catalog`** — `RolesPage`dagi chap-o'ng emas, **ichma-ich accordion** daraxt (har bir tugun bosilganda o'z farzandlarini ochadi, `chevron` aylanish animatsiyasi bilan — `theme.css`dagi mavjud o'tish uslubi). Har bir qatorda: nom, "+" (farzand qo'shish, inline mini-forma), qalam (nomini tahrirlash, inline), chiqindi qutisi (`catalog.manage`, `ConfirmDialog` orqali — agar farzandi bo'lsa backend 409 qaytaradi, buni aniq xabar bilan ko'rsatamiz: "Avval ichidagi bo'limlarni o'chiring").

**`SalesPage.tsx`ning forma qo'shimchasi** — mavjud "Yangi savdo" formasidagi mijoz/narx/muddat maydonlaridan keyin bitta yangi `<select>` ("Kategoriya (ixtiyoriy)"), flat-qilingan daraxt nomlaridan (`—` bo'sh variant birinchi), `catalog_category_id`ni to'g'ridan-to'g'ri `createSale`ga uzatadi.

**`/dashboard/course-sales`** — davr tanlash (ikkita sana, `FinancePage`ning payroll-davr pattern'i bilan bir xil), natija: kartochkalar grid (`grid-cols-1 sm:grid-cols-2`), har biri kategoriya nomi + `sales_count` (kichik, kulrang) + `total_amount` (katta, `text-primary`, `formatMoney` bilan) — **hisob-kitob manbai:** 100% `CategorySalesEntryOut`dan, frontend hech narsani qo'shmaydi.

**`/dashboard/reports`** — beshta blok, har biri `glass-card` ichida sarlavha + ikonka (`AlertTriangle` agar ro'yxat bo'sh bo'lmasa, `CheckCircle2` agar bo'sh bo'lsa — "muammo yo'q" holati ham aniq ko'rsatiladi, sukut emas) + ichki ro'yxat (qisqa, birinchi 5-10 ta yozuv, sana bilan). Tepada to'rtta eksport tugmasi (`customers`/`sales`/`finance`/`calls`, har biri CSV/XLSX ikki-tugmali mini-guruh) — bosilganda `fetch` orqali blob olinib `URL.createObjectURL` + vaqtinchalik `<a download>` bilan brauzer yuklab olish oynasi chaqiriladi (yangi pattern, oldingi fazalarda hech qayerda fayl yuklab olish bo'lmagan).

### Sinov
Katalogda bir nechta ichma-ich bo'lim yaratish → savdo formasida shu kategoriyani tanlab yangi savdo qo'shish → Course sales sahifasida shu savdoning ko'rinishini tekshirish → Hisobotlar sahifasida diagnostika bloklari va eksport (CSV) haqiqatan fayl yuklab berishini tekshirish.

---

## Yangi umumiy komponentlar (bir marta quriladi, barcha fazalarda qayta ishlatiladi)

- **`ConfirmDialog`** — qaytarib bo'lmaydigan amallar uchun tasdiqlash oynasi (xodimni deaktivatsiya, adjustment-request tasdiqlash/rad etish).
- **`IntegrationCard`** — provayder ulash kartochkasi (ikonka, brend rangi, holat, forma). Faza C (UTEL) va Faza D (AmoCRM/Bitrix24/Meta Ads/Telegram) shu bittasidan foydalanadi.
- **`StatusBadge`** — rangli holat belgisi (`Sales`/`CustomersPage`da qo'lda yozilgan uslub endi umumiy komponentga chiqariladi: `active/pending/answered`=oltin, `completed/approved/sent/customer`=yashil, `cancelled/rejected/missed/failed/lost`=qizil).
- Har biri mavjud dizayn tiliga (`glass-card`, `FormField`, `Button` variant'lari, `toast` orqali xabar) qat'iy amal qiladi — landing sahifada ishlatilgan og'ir animatsiyalar (orbit, sparkle, marquee) dashboard sahifalarida ishlatilmaydi; faqat yengil `hover:-translate-y-1` va `auth-card-enter` kabi bir martalik o'tish animatsiyalari.

## Ishlash tartibi (backend → frontend ketma-ketligi)

Har bir faza ichida qat'iy tartib: **avval backend, keyin frontend** — chunki frontend backend javobining aniq shaklini (`response_model`) bilishi kerak:

1. **Backend audit** — ushbu fayldagi "Backend" bo'limini qayta tekshirib chiqish (endpoint/schema o'zgargan bo'lishi mumkin — kod haqiqiy manba).
2. **Backend gap bo'lsa** — avval shuni yozamiz (masalan Faza A boshida hech qanday yangi backend kod kerak emas, chunki 2FA endpoint'lari allaqachon bor — faqat frontend sahifasi yo'q).
3. **Frontend API client** (`lib/api/*.ts`) — yuqoridagi jadvaldagi funksiyalar, backend `schemas.py`ga bir xil (TypeScript interfeyslar Pydantic modelga mos).
4. **Frontend UI** — sahifa/komponent, "Sahifa dizayni va animatsiya" bo'limiga muvofiq.
5. `npx tsc -b` → Playwright orqali real VPS'da sinov (`Sinov` bo'limidagi ssenariy) → xatolarni tuzatish.
6. Foydalanuvchiga qisqa hisobot: nima qurildi, nima sinaldi, qanday sinaldi — keyin navbatdagi fazaga o'tish uchun ruxsat so'raladi.

Fazalar orasida ham shu tartib takrorlanadi: A tugaydi va tasdiqlanadi → B boshlanadi (o'z ichida backend audit → frontend), va hokazo E'gacha.
