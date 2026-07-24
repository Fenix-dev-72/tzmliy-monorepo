# Tizimning hozirgi holati — xavfsizlik va multi-tenant arxitektura

## Ular aytgan tashvish

Har bir biznes (tenant) uchun asosiy baza ichida alohida kichik database ochish kerak, aks
holda ma'lumotlar aralashib ketishi mumkin; bitta token sizib chiqsa butun tizim xavf ostida
qoladi.

## Aslida qilingan ish

### 1. Tenant izolyatsiyasi — Row Level Security (RLS)

Har bir biznesning ma'lumoti (savdolar, mijozlar, moliya, integratsiyalar va h.k.) bitta
umumiy PostgreSQL bazasida saqlanadi, lekin har bir jadvalda `FORCE ROW LEVEL SECURITY`
yoqilgan:

- Har bir so'rov faqat o'zining `tenant_id`siga tegishli qatorlarni ko'radi.
- Bu tekshiruv SQL (baza) darajasida ishlaydi — dastur kodida xatolik bo'lsa ham, boshqa
  biznesning ma'lumotiga kirish imkonsiz.
- Alohida kichik database ochishdan farqli o'laroq, bu yondashuv minglab tenant bo'lganda ham
  operatsion jihatdan boshqarish oson va tez — har bir yangilanish/migratsiyani minglab
  bazada alohida-alohida qilish shart emas.

### 2. Tokenlar va parollar xom holda saqlanmaydi

- CRM/Meta Ads/qo'ng'iroq integratsiyalarining `access_token`/`refresh_token`lari —
  **shifrlangan** holda saqlanadi (Fernet/AES), faqat server o'zining maxfiy kaliti bilan
  ochadi.
- Foydalanuvchi parollari — **bcrypt** bilan hashlanadi (qaytarib bo'lmaydi, hatto bazaga
  kirilsa ham parolning o'zini ko'rib bo'lmaydi).
- Sessiya/refresh tokenlar — **sha256 hash** qilib saqlanadi.
- Login access token (JWT) faqat brauzer xotirasida (vaqtinchalik) turadi, `localStorage`da
  saqlanmaydi — brauzer skript orqali o'g'irlash xavfini kamaytirish uchun.

### 3. Natija

Bitta token yoki hisob ma'lumoti sizib chiqsa ham:

- U faqat **bitta** tenant/provider'ga tegishli — boshqa bizneslarning ma'lumotiga umuman
  aloqasi yo'q (RLS kafolatlaydi).
- Baza ichida ham shifrlangan holda turgani uchun, hatto bazaga to'g'ridan-to'g'ri kirilsa
  ham xom token/parol ko'rinmaydi.

## Xulosa

"Alohida kichik database" o'rniga qo'llanilgan RLS — bu yirik SaaS kompaniyalar (Stripe,
Salesforce va h.k.) ishlatadigan standart, tekshirilgan yondashuv bo'lib, xavfsizlik
jihatidan alohida database'dan kam emas, aksincha boshqarish jihatidan ancha qulayroq.
