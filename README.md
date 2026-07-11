# Tzmliy — mono repo

Ko'p-tenant B2B SaaS (savdo, moliya, CRM, qo'ng'iroqlar, analitika). Bu repo ikkita avval alohida bo'lgan repoларni birlashtiradi:

- **`backend/`** — FastAPI'ga asoslangan modular monolit (Python 3.13, PostgreSQL, Redis).
- **`frontend/`** — React + TypeScript SPA (Vite).

Ikkalasi ham **mustaqil ishga tushiriladi** — umumiy build yo'q, faqat umumiy repo. Frontend backendga oddiy HTTP orqali (`VITE_API_BASE_URL`) ulanadi.

---

## Kerakli dasturlar (oldindan o'rnatilgan bo'lishi kerak)

| Dastur | Versiya | Nima uchun |
|---|---|---|
| [Python](https://www.python.org/downloads/) | 3.13 | Backend |
| [Node.js](https://nodejs.org/) | 20+ | Frontend (npm bilan birga keladi) |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | so'nggi | Lokal PostgreSQL, Redis, MinIO konteynerlari uchun |
| Git | so'nggi | Repo bilan ishlash uchun |

---

## 1-qadam: Repozitoriyani yuklab olish

```bash
git clone https://github.com/Fenix-dev-72/tzmliy-monorepo.git
cd tzmliy-monorepo
```

---

## 2-qadam: Backend'ni sozlash (`backend/`)

### 2.1. Virtual muhit yaratish va kutubxonalarni o'rnatish

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# yoki: source .venv/bin/activate   # macOS/Linux

pip install -r requirements.txt
```

### 2.2. `.env` faylini yaratish

```bash
copy .env.example .env          # Windows
# yoki: cp .env.example .env       # macOS/Linux
```

`.env` faylini oching va quyidagilarni sozlang (dastlab shu ikkitasi eng muhimi, qolganlari lokal ishlash uchun tayyor holatda bo'sh qoldirilishi mumkin):

- **`JWT_SECRET`** — tasodifiy maxfiy kalit generatsiya qiling:
  ```bash
  python -c "import secrets; print(secrets.token_urlsafe(48))"
  ```
- **`SECRET_ENCRYPTION_KEY`** — Fernet kaliti generatsiya qiling:
  ```bash
  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  ```

Qolgan qatorlar (`TELEGRAM_GATEWAY_API_TOKEN`, `SMTP_*`, `PAYME_*`, `CLICK_*`, `OBJECT_STORAGE_*`) real tashqi xizmatlar uchun — bo'sh qoldirilsa, tegishli funksiyalar (SMS/email yuborish, to'lov, fayl yuklash) shunchaki jurnalga yozib qo'yiladi yoki jim ishlamaydi, lekin **ilova baribir to'liq ishga tushadi**.

### 2.3. Lokal PostgreSQL, Redis va MinIO'ni ishga tushirish (Docker)

```bash
docker compose up -d postgres redis minio
```

### 2.4. Ma'lumotlar bazasi migratsiyalarini qo'llash

```bash
python -m app.db.migrate
```

### 2.5. Birinchi Platform Admin foydalanuvchisini yaratish

(Tizimga kirish uchun boshqa yo'l yo'q, chunki hali birorta admin mavjud emas)

```bash
python -m app.db.seed_platform_admin --email admin@example.com --password "KuchliParol123!"
```

### 2.6. Serverni ishga tushirish

```bash
uvicorn app.main:app --reload
```

Backend endi shu yerda ishlaydi: **http://127.0.0.1:8000**
Interaktiv API hujjatlari (Swagger): **http://127.0.0.1:8000/docs**

---

## 3-qadam: Frontend'ni sozlash (`frontend/`)

Yangi terminal oyna oching (backend terminalini ochiq qoldiring):

```bash
cd frontend
npm install
```

`.env.local` faylini yarating:

```bash
copy .env.example .env.local    # Windows
# yoki: cp .env.example .env.local   # macOS/Linux
```

`.env.local` faylida `VITE_API_BASE_URL`ni **lokal backend**ga ko'rsating (standart holatda staging serverga qaragan bo'lishi mumkin):

```
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Dasturni ishga tushiring:

```bash
npm run dev
```

Frontend endi shu yerda ishlaydi: **http://localhost:5173** (yoki terminalda ko'rsatilgan boshqa port)

---

## 4-qadam: Tekshirish

1. Brauzerda frontend manzilini oching.
2. "Ro'yxatdan o'tish" orqali yangi kompaniya (tenant) yarating — bu backend + baza + frontend birgalikda ishlayotganini tasdiqlaydi.
3. Platform Admin konsoliga kirish uchun: frontend manzili + `/platform/login`, 2.5-qadamda yaratilgan email/parol bilan.

---

## Muhim eslatmalar

- **Hech qanday `.env` fayl git'ga commit qilinmaydi** (`.gitignore`da chiqarib tashlangan) — har bir dasturchi o'zining lokal `.env`/`.env.local` faylini yaratishi kerak.
- Backendda hali avtomatlashtirilgan test to'plami yo'q — `backend/test_main.http` faylida qo'lda sinash uchun tayyor so'rovlar bor (PyCharm/IntelliJ HTTP client bilan ochiladi).
- To'liq arxitektura, modul tuzilishi va ishlab chiqish qoidalari — **`backend/CLAUDE.md`**da.
- Frontend'ning texnik stack va dizayn qoidalari — **`frontend/CLAUDE.md`**da.
- Backend API'ning to'liq xarita/kontrakti (qaysi sahifa qaysi endpoint'ni chaqiradi) — **`backend/FRONTEND.md`**da.
- Ishlab chiqilgan/qurilgan fazalar rejasi — **`backend/plan.md`**da.
- Jonli (staging) server allaqachon ishlaydi: `http://89.43.33.8:8001` — bu **real serverga tegishli, uni lokal sozlash uchun ishlatish shart emas**, batafsili `backend/CLAUDE.md`ning "Deployment" bo'limida.
