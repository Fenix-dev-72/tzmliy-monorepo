import { useState } from "react";
import { Check } from "lucide-react";
import { Link } from "react-router";
import { useLang } from "@/lib/i18n/LangContext";
import { Reveal } from "@/components/shared/Reveal";

// "Pricing Plans" style section (reference: TeamWave/Framer template's
// Monthly/Yearly toggle + 3-card pricing block, middle card highlighted as
// "Popular"). Rebuilt around Tizimly's real three billing plans (backend:
// billing_plans.code CHECK IN ('starter','business','enterprise'), see
// CLAUDE.md's Billing/Faza 8 section) instead of generic Basic/Pro/
// Enterprise copy, priced in so'm (this is a Uzbekistan-market product, not
// USD), with the yearly toggle applying the real -20% the tab label
// promises.

interface Plan {
  code: string;
  name: string;
  monthly: number | null;
  features: string[];
  popular?: boolean;
}

const content = {
  uz: {
    badge: "Tariflar",
    title: "Tarif rejalari",
    subtitle: "Har qanday biznes hajmi uchun mos tarifni tanlang.",
    monthly: "Oylik",
    yearly: "Yillik — 20% chegirma",
    perMonth: "/oy",
    custom: "Individual",
    cta: "Ushbu tarifni tanlash",
    ctaEnterprise: "Narx so'rash",
    plans: [
      {
        code: "starter",
        name: "Starter",
        monthly: 299000,
        features: [
          "Savdo va ombor boshqaruvi",
          "CRM va mijozlar bazasi",
          "Asosiy analitika va hisobotlar",
          "5 GB xotira",
          "Email orqali qo'llab-quvvatlash",
        ],
      },
      {
        code: "business",
        name: "Business",
        monthly: 590000,
        popular: true,
        features: [
          "Barcha Starter imkoniyatlari",
          "AmoCRM, Bitrix24, Meta Ads integratsiyalari",
          "Telegram bot orqali bildirishnomalar",
          "Kengaytirilgan hisobot va eksport (CSV/XLSX)",
          "50 GB xotira",
          "Ustuvor qo'llab-quvvatlash",
        ],
      },
      {
        code: "enterprise",
        name: "Enterprise",
        monthly: null,
        features: [
          "Barcha Business imkoniyatlari",
          "Shaxsiy hisob menejeri",
          "Maxsus integratsiyalar",
          "Cheksiz xotira",
          "24/7 qo'llab-quvvatlash",
          "SLA kafolati",
        ],
      },
    ] as Plan[],
  },
  ru: {
    badge: "Тарифы",
    title: "Тарифные планы",
    subtitle: "Выберите подходящий тариф для бизнеса любого размера.",
    monthly: "Помесячно",
    yearly: "Ежегодно — скидка 20%",
    perMonth: "/мес",
    custom: "Индивидуально",
    cta: "Выбрать этот тариф",
    ctaEnterprise: "Запросить цену",
    plans: [
      {
        code: "starter",
        name: "Starter",
        monthly: 299000,
        features: [
          "Управление продажами и складом",
          "CRM и база клиентов",
          "Базовая аналитика и отчёты",
          "5 ГБ хранилища",
          "Поддержка по email",
        ],
      },
      {
        code: "business",
        name: "Business",
        monthly: 590000,
        popular: true,
        features: [
          "Все возможности Starter",
          "Интеграции AmoCRM, Bitrix24, Meta Ads",
          "Уведомления через Telegram-бота",
          "Расширенные отчёты и экспорт (CSV/XLSX)",
          "50 ГБ хранилища",
          "Приоритетная поддержка",
        ],
      },
      {
        code: "enterprise",
        name: "Enterprise",
        monthly: null,
        features: [
          "Все возможности Business",
          "Персональный менеджер",
          "Индивидуальные интеграции",
          "Неограниченное хранилище",
          "Поддержка 24/7",
          "Гарантия SLA",
        ],
      },
    ] as Plan[],
  },
};

function formatSom(amount: number) {
  return new Intl.NumberFormat("ru-RU").format(amount);
}

export function PricingSection() {
  const { lang } = useLang();
  const t = content[lang];
  const [yearly, setYearly] = useState(false);

  return (
    <section id="pricing" className="relative overflow-hidden py-20 sm:py-28">
      <div
        className="landing-glow-drift pointer-events-none absolute top-0 left-1/2 h-[400px] w-[900px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: "radial-gradient(ellipse, rgba(212,175,55,0.1) 0%, transparent 70%)" }}
      />

      <div className="relative mx-auto max-w-6xl px-6">
        <Reveal className="mx-auto mb-10 max-w-2xl text-center">
          <div className="border-primary/25 bg-primary/10 mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5">
            <div className="bg-primary size-1.5 rounded-full" />
            <span className="text-primary text-[13px] font-semibold">{t.badge}</span>
          </div>
          <h2 className="font-display mb-4 text-[clamp(28px,4.2vw,44px)] leading-[1.15] font-bold tracking-tight">
            {t.title}
          </h2>
          <p className="text-foreground-muted text-[15px] leading-relaxed">{t.subtitle}</p>
        </Reveal>

        <Reveal delay={80} className="mb-10 flex justify-center">
          <div className="border-card-border bg-card/40 inline-flex items-center gap-1 rounded-full border p-1">
            <button
              type="button"
              onClick={() => setYearly(false)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                !yearly ? "bg-primary text-primary-foreground" : "text-foreground-muted hover:text-foreground"
              }`}
            >
              {t.monthly}
            </button>
            <button
              type="button"
              onClick={() => setYearly(true)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                yearly ? "bg-primary text-primary-foreground" : "text-foreground-muted hover:text-foreground"
              }`}
            >
              {t.yearly}
            </button>
          </div>
        </Reveal>

        <div className="grid gap-6 lg:grid-cols-3">
          {t.plans.map((plan, i) => {
            const price = plan.monthly === null ? null : yearly ? Math.round((plan.monthly * 0.8) / 1000) * 1000 : plan.monthly;
            return (
              <Reveal key={plan.code} delay={i * 90}>
                <div
                  className={`flex h-full flex-col rounded-3xl border p-8 ${
                    plan.popular ? "border-primary bg-card shadow-lg" : "border-card-border bg-card/40"
                  }`}
                >
                  <span
                    className={`mb-6 inline-block w-fit rounded-lg border px-3 py-1 text-xs font-bold tracking-wide uppercase ${
                      plan.popular ? "border-primary/40 text-primary" : "border-card-border text-foreground-muted"
                    }`}
                  >
                    {plan.name}
                  </span>

                  <div className="mb-6">
                    {price === null ? (
                      <span className="text-4xl font-bold">{t.custom}</span>
                    ) : (
                      <>
                        <span className="text-4xl font-bold">{formatSom(price)}</span>
                        <span className="text-foreground-muted ml-1 text-sm">{"so'm"}{t.perMonth}</span>
                      </>
                    )}
                  </div>

                  <ul className="border-card-border mb-8 flex-1 space-y-3 border-t pt-6">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm">
                        <Check size={16} className="mt-0.5 shrink-0" style={{ color: "var(--color-primary)" }} />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    to="/register"
                    className={`rounded-xl px-6 py-3 text-center text-sm font-bold transition-opacity hover:opacity-90 ${
                      plan.popular ? "gold-gradient-bg text-[#0A0E1A]" : "border-card-border hover:bg-accent border"
                    }`}
                  >
                    {plan.monthly === null ? t.ctaEnterprise : t.cta}
                  </Link>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
