import { Link } from "react-router";
import type { ReactNode } from "react";
import { useLang } from "@/lib/i18n/LangContext";
import { TizimlyLogo, TizimlyWordmark } from "@/components/layout/TizimlyLogo";

// Static legal/compliance pages (Privacy Policy, Terms of Service, Data
// Deletion) — added 2026-07-27 because Meta App Review requires publicly
// reachable Privacy Policy + Data Deletion URLs before an app can request
// Advanced Access / go Live. These are the real URLs registered in the Meta
// app's Basic Settings:
//   https://tizimly.duckdns.org/privacy
//   https://tizimly.duckdns.org/terms
//   https://tizimly.duckdns.org/data-deletion
// Kept deliberately plain (no dashboard chrome, no auth) so a reviewer or any
// visitor can read them without logging in. Content is bilingual (uz/ru) via
// the same useLang() context the landing page uses.

const CONTACT_EMAIL = "samandarorifjonov749@gmail.com";
const LAST_UPDATED = "2026-07-27";

function LegalLayout({ title, updatedLabel, children }: { title: string; updatedLabel: string; children: ReactNode }) {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-card-border border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-2">
            <TizimlyLogo size={26} gradientId="legalLogoGrad" />
            <TizimlyWordmark className="h-5" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-heading text-3xl font-extrabold">{title}</h1>
        <p className="text-foreground-muted mt-2 text-sm">
          {updatedLabel}: {LAST_UPDATED}
        </p>
        <div className="mt-8 space-y-8 leading-relaxed">{children}</div>
      </main>

      <footer className="border-card-border text-foreground-muted border-t">
        <div className="mx-auto max-w-3xl px-6 py-8 text-center text-xs">
          © {new Date().getFullYear()} Tizimly. {CONTACT_EMAIL}
        </div>
      </footer>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-heading text-foreground text-xl font-bold">{heading}</h2>
      <div className="text-foreground-muted mt-3 space-y-3 text-[0.95rem]">{children}</div>
    </section>
  );
}

/* ------------------------------- Privacy ------------------------------- */

export function PrivacyPage() {
  const { lang } = useLang();
  if (lang === "ru") {
    return (
      <LegalLayout title="Политика конфиденциальности" updatedLabel="Обновлено">
        <Section heading="1. Кто мы">
          <p>
            Tizimly — облачная платформа для управления бизнесом (продажи, финансы, CRM, звонки, аналитика).
            Настоящая политика описывает, какие данные мы собираем и как их используем.
          </p>
        </Section>
        <Section heading="2. Какие данные мы собираем">
          <p>— Данные аккаунта: email и/или номер телефона, имя, роль в организации.</p>
          <p>— Бизнес-данные, которые вы вводите: клиенты, сделки, платежи, звонки, сотрудники.</p>
          <p>
            — Данные рекламной статистики Meta: если вы подключаете рекламный аккаунт Facebook, мы получаем
            <b> только для чтения</b> статистику кампаний (показы, клики, расход) через разрешение
            <code> ads_read</code>. Мы не создаём, не изменяем и не удаляем ваши рекламные кампании.
          </p>
        </Section>
        <Section heading="3. Как мы используем данные">
          <p>
            Данные используются исключительно для предоставления сервиса: отображение вашей статистики,
            аналитики и отчётов внутри вашего аккаунта. Мы не продаём и не передаём ваши данные третьим лицам
            в рекламных целях.
          </p>
        </Section>
        <Section heading="4. Сторонние сервисы">
          <p>
            Мы взаимодействуем с: Meta (Facebook) — для получения рекламной статистики; Telegram — для
            доставки кодов и уведомлений; поставщиками платежей (Click, Payme) — для оплаты подписки. Каждый
            из них обрабатывает данные согласно своим правилам.
          </p>
        </Section>
        <Section heading="5. Хранение и защита">
          <p>
            Данные хранятся на защищённых серверах с изоляцией по каждой организации. Токены доступа шифруются.
            Мы храним данные, пока активен ваш аккаунт.
          </p>
        </Section>
        <Section heading="6. Ваши права">
          <p>
            Вы можете запросить доступ, исправление или удаление ваших данных, а также отозвать доступ к
            рекламному аккаунту Meta в любой момент. См. страницу <Link className="text-primary" to="/data-deletion">удаления данных</Link>.
          </p>
        </Section>
        <Section heading="7. Контакты">
          <p>
            По любым вопросам: <a className="text-primary" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
        </Section>
      </LegalLayout>
    );
  }
  return (
    <LegalLayout title="Maxfiylik siyosati" updatedLabel="Yangilangan">
      <Section heading="1. Biz kimmiz">
        <p>
          Tizimly — biznesni boshqarish uchun bulutli platforma (savdo, moliya, CRM, qo'ng'iroqlar, analitika).
          Ushbu siyosat qanday ma'lumotlarni yig'ishimiz va ulardan qanday foydalanishimizni tushuntiradi.
        </p>
      </Section>
      <Section heading="2. Qanday ma'lumot yig'amiz">
        <p>— Hisob ma'lumotlari: email va/yoki telefon raqami, ism, tashkilotdagi rol.</p>
        <p>— Siz kiritadigan biznes ma'lumotlari: mijozlar, savdolar, to'lovlar, qo'ng'iroqlar, xodimlar.</p>
        <p>
          — Meta reklama statistikasi: agar Facebook reklama akkauntingizni ulasangiz, biz kampaniya
          statistikasini (ko'rsatishlar, kliklar, xarajat) <b>faqat o'qish uchun</b> <code>ads_read</code>
          ruxsati orqali olamiz. Biz sizning reklamalaringizni yaratmaymiz, o'zgartirmaymiz va o'chirmaymiz.
        </p>
      </Section>
      <Section heading="3. Ma'lumotdan qanday foydalanamiz">
        <p>
          Ma'lumotlar faqat xizmatni taqdim etish uchun ishlatiladi: statistika, analitika va hisobotlarni
          o'z akkauntingiz ichida ko'rsatish. Biz ma'lumotlaringizni reklama maqsadida uchinchi shaxslarga
          sotmaymiz va bermaymiz.
        </p>
      </Section>
      <Section heading="4. Uchinchi tomon xizmatlari">
        <p>
          Biz quyidagilar bilan ishlaymiz: Meta (Facebook) — reklama statistikasini olish uchun; Telegram —
          kod va bildirishnomalarni yetkazish uchun; to'lov provayderlari (Click, Payme) — obuna to'lovi
          uchun. Ularning har biri o'z qoidalari asosida ma'lumotni qayta ishlaydi.
        </p>
      </Section>
      <Section heading="5. Saqlash va himoya">
        <p>
          Ma'lumotlar har bir tashkilot bo'yicha ajratilgan, himoyalangan serverlarda saqlanadi. Kirish
          tokenlari shifrlanadi. Ma'lumotlar akkauntingiz faol bo'lguncha saqlanadi.
        </p>
      </Section>
      <Section heading="6. Sizning huquqlaringiz">
        <p>
          Siz istalgan vaqtda ma'lumotlaringizga kirish, ularni tuzatish yoki o'chirishni so'rashingiz, hamda
          Meta reklama akkauntiga ruxsatni bekor qilishingiz mumkin. <Link className="text-primary" to="/data-deletion">Ma'lumotni o'chirish</Link> sahifasiga qarang.
        </p>
      </Section>
      <Section heading="7. Bog'lanish">
        <p>
          Har qanday savol bo'yicha: <a className="text-primary" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </Section>
    </LegalLayout>
  );
}

/* -------------------------------- Terms -------------------------------- */

export function TermsPage() {
  const { lang } = useLang();
  if (lang === "ru") {
    return (
      <LegalLayout title="Условия использования" updatedLabel="Обновлено">
        <Section heading="1. Сервис">
          <p>
            Tizimly предоставляет облачные инструменты для управления продажами, финансами, клиентами и
            аналитикой. Используя сервис, вы соглашаетесь с настоящими условиями.
          </p>
        </Section>
        <Section heading="2. Аккаунт">
          <p>
            Вы отвечаете за сохранность своих учётных данных и за все действия в рамках вашего аккаунта.
            Запрещено использовать сервис в незаконных целях.
          </p>
        </Section>
        <Section heading="3. Подписка и оплата">
          <p>
            Сервис предоставляется по подписке (включая бесплатный пробный период). Оплата производится через
            Click или Payme. Условия тарифов отображаются при оформлении.
          </p>
        </Section>
        <Section heading="4. Интеграции">
          <p>
            При подключении сторонних сервисов (например, рекламного аккаунта Meta) вы разрешаете Tizimly
            получать соответствующие данные только для чтения и отображения статистики.
          </p>
        </Section>
        <Section heading="5. Ответственность">
          <p>
            Сервис предоставляется «как есть». Мы стремимся к бесперебойной работе, но не гарантируем
            отсутствие сбоев. Мы не несём ответственности за косвенные убытки.
          </p>
        </Section>
        <Section heading="6. Прекращение">
          <p>Вы можете прекратить использование в любой момент. Мы можем приостановить аккаунт при нарушении условий.</p>
        </Section>
        <Section heading="7. Контакты">
          <p>
            Вопросы: <a className="text-primary" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
        </Section>
      </LegalLayout>
    );
  }
  return (
    <LegalLayout title="Foydalanish shartlari" updatedLabel="Yangilangan">
      <Section heading="1. Xizmat">
        <p>
          Tizimly savdo, moliya, mijozlar va analitikani boshqarish uchun bulutli vositalarni taqdim etadi.
          Xizmatdan foydalanish orqali siz ushbu shartlarga rozilik bildirasiz.
        </p>
      </Section>
      <Section heading="2. Hisob">
        <p>
          Siz hisob ma'lumotlaringiz xavfsizligi va akkauntingiz doirasidagi barcha harakatlar uchun
          javobgarsiz. Xizmatdan noqonuniy maqsadlarda foydalanish taqiqlanadi.
        </p>
      </Section>
      <Section heading="3. Obuna va to'lov">
        <p>
          Xizmat obuna asosida taqdim etiladi (bepul sinov muddati bilan). To'lov Click yoki Payme orqali
          amalga oshiriladi. Tarif shartlari rasmiylashtirish vaqtida ko'rsatiladi.
        </p>
      </Section>
      <Section heading="4. Integratsiyalar">
        <p>
          Uchinchi tomon xizmatlarini (masalan, Meta reklama akkaunti) ulaganingizda, siz Tizimly'ga tegishli
          ma'lumotlarni faqat o'qish va statistikani ko'rsatish uchun olishga ruxsat berasiz.
        </p>
      </Section>
      <Section heading="5. Javobgarlik">
        <p>
          Xizmat "boricha" taqdim etiladi. Biz uzluksiz ishlashga intilamiz, biroq nosozliklar bo'lmasligiga
          kafolat bermaymiz. Bilvosita zararlar uchun javobgar emasmiz.
        </p>
      </Section>
      <Section heading="6. To'xtatish">
        <p>Siz istalgan vaqtda foydalanishni to'xtatishingiz mumkin. Shartlar buzilса, biz akkauntni to'xtatib qo'yishimiz mumkin.</p>
      </Section>
      <Section heading="7. Bog'lanish">
        <p>
          Savollar: <a className="text-primary" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </Section>
    </LegalLayout>
  );
}

/* ---------------------------- Data Deletion ---------------------------- */

export function DataDeletionPage() {
  const { lang } = useLang();
  if (lang === "ru") {
    return (
      <LegalLayout title="Удаление данных" updatedLabel="Обновлено">
        <Section heading="Как удалить свои данные">
          <p>
            Вы можете в любой момент запросить удаление ваших данных из Tizimly, включая данные, полученные
            через подключённые сервисы (например, рекламную статистику Meta).
          </p>
          <p>
            Отправьте письмо на <a className="text-primary" href={`mailto:${CONTACT_EMAIL}?subject=Data%20deletion%20request`}>{CONTACT_EMAIL}</a>
            {" "}с темой «Data deletion request» и укажите email или номер телефона вашего аккаунта.
          </p>
          <p>Мы удалим связанные данные в течение 30 дней и подтвердим удаление по email.</p>
          <p>
            Также вы можете в любой момент отозвать доступ приложения в настройках вашего аккаунта Facebook:
            «Настройки и конфиденциальность» → «Настройки» → «Приложения и сайты».
          </p>
        </Section>
      </LegalLayout>
    );
  }
  return (
    <LegalLayout title="Ma'lumotni o'chirish" updatedLabel="Yangilangan">
      <Section heading="Ma'lumotlaringizni qanday o'chirish mumkin">
        <p>
          Siz istalgan vaqtda Tizimly'dagi ma'lumotlaringizni, jumladan ulangan xizmatlar orqali olingan
          ma'lumotlarni (masalan, Meta reklama statistikasi) o'chirishni so'rashingiz mumkin.
        </p>
        <p>
          <a className="text-primary" href={`mailto:${CONTACT_EMAIL}?subject=Data%20deletion%20request`}>{CONTACT_EMAIL}</a>
          {" "}manziliga "Data deletion request" mavzusi bilan xat yuboring va akkauntingiz email yoki telefon
          raqamini ko'rsating.
        </p>
        <p>Biz tegishli ma'lumotlarni 30 kun ichida o'chiramiz va o'chirilganini email orqali tasdiqlaymiz.</p>
        <p>
          Shuningdek, istalgan vaqtda Facebook akkaunt sozlamalaringizdan ilova ruxsatini bekor qilishingiz
          mumkin: "Sozlamalar va maxfiylik" → "Sozlamalar" → "Ilovalar va veb-saytlar".
        </p>
      </Section>
    </LegalLayout>
  );
}
