import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Link } from "react-router";
import { useLang } from "@/lib/i18n/LangContext";
import { Reveal } from "@/components/shared/Reveal";
import { CardConnector } from "@/components/shared/CardConnector";
import { useReveal } from "@/lib/hooks/useReveal";
import * as billingApi from "@/lib/api/billing";
import type { BillingPlanPublic } from "@/lib/api/billing";

// "Pricing Plans" style section (reference: TeamWave/Framer template's
// Monthly/Yearly toggle + 3-card pricing block, middle card highlighted as
// "Popular"). Reads real plans from GET /api/v1/billing/plans/public
// (billing_plans table, Platform Admin managed under /platform/billing-plans)
// instead of hardcoded copy -- a new plan created there appears here
// automatically. Only the yearly -20% math stays client-side (no yearly
// billing period exists on the backend yet).

const content = {
  uz: {
    badge: "Tariflar",
    title: "Tarif rejalari",
    subtitle: "Har qanday biznes hajmi uchun mos tarifni tanlang.",
    monthly: "Oylik",
    yearly: "Yillik — 20% chegirma",
    perMonth: "/oy",
    cta: "Ushbu tarifni tanlash",
    ctaTrial: "Bepul boshlash",
    free: "Bepul",
    trialDays: (days: number) => `${days} kun`,
    empty: "Tariflar hozircha e'lon qilinmagan.",
  },
  ru: {
    badge: "Тарифы",
    title: "Тарифные планы",
    subtitle: "Выберите подходящий тариф для бизнеса любого размера.",
    monthly: "Помесячно",
    yearly: "Ежегодно — скидка 20%",
    perMonth: "/мес",
    cta: "Выбрать этот тариф",
    ctaTrial: "Начать бесплатно",
    free: "Бесплатно",
    trialDays: (days: number) => `${days} дней`,
    empty: "Тарифы пока не опубликованы.",
  },
};

function formatPrice(amount: number, currency: string): string {
  if (currency === "USD") {
    return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount / 100)}`;
  }
  return `${new Intl.NumberFormat("ru-RU").format(amount)} so'm`;
}

export function PricingSection() {
  const { lang } = useLang();
  const t = content[lang];
  const [yearly, setYearly] = useState(false);
  const [plans, setPlans] = useState<BillingPlanPublic[] | null>(null);
  const { ref: gridRef, visible: gridVisible } = useReveal<HTMLDivElement>(0.2);

  useEffect(() => {
    billingApi
      .listPublicPlans()
      .then(setPlans)
      .catch(() => setPlans([]));
  }, []);

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

        {plans === null && (
          <div className="text-foreground-muted flex justify-center py-16">
            <Loader2 size={22} className="animate-spin" />
          </div>
        )}

        {plans !== null && plans.length === 0 && (
          <p className="text-foreground-muted py-16 text-center text-sm">{t.empty}</p>
        )}

        {plans !== null && plans.length > 0 && (
          <div ref={gridRef} className={`grid gap-6 ${plans.length >= 3 ? "lg:grid-cols-3" : plans.length === 2 ? "sm:grid-cols-2" : ""}`}>
            {plans.map((plan, i) => {
              const price = yearly ? Math.round((plan.price_amount * 0.8) / 1000) * 1000 : plan.price_amount;
              const features = lang === "uz" ? plan.features_uz : plan.features_ru;
              const isFree = plan.is_trial || plan.price_amount === 0;
              return (
                <Reveal key={plan.code} delay={i * 90} className="relative">
                  {i < plans.length - 1 && (
                    <CardConnector
                      orientation="h"
                      visible={gridVisible}
                      delay={i * 90 + 60}
                      className="absolute top-1/2 -right-6 hidden w-6 -translate-y-1/2 lg:block"
                    />
                  )}
                  <div
                    className={`flex h-full flex-col rounded-3xl border p-8 ${
                      plan.is_popular ? "border-primary bg-card shadow-lg" : "border-card-border bg-card/40"
                    }`}
                  >
                    <span
                      className={`mb-6 inline-block w-fit rounded-lg border px-3 py-1 text-xs font-bold tracking-wide uppercase ${
                        plan.is_popular ? "border-primary/40 text-primary" : "border-card-border text-foreground-muted"
                      }`}
                    >
                      {plan.name}
                    </span>

                    <div className="mb-6">
                      {isFree ? (
                        <>
                          <span className="text-4xl font-bold">{t.free}</span>
                          {plan.trial_days !== null && (
                            <span className="text-foreground-muted ml-1 text-sm">— {t.trialDays(plan.trial_days)}</span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="text-4xl font-bold">{formatPrice(price, plan.currency)}</span>
                          <span className="text-foreground-muted ml-1 text-sm">{t.perMonth}</span>
                        </>
                      )}
                    </div>

                    <ul className="border-card-border mb-8 flex-1 space-y-3 border-t pt-6">
                      {features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5 text-sm">
                          <Check size={16} className="mt-0.5 shrink-0" style={{ color: "var(--color-primary)" }} />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>

                    <Link
                      to="/register"
                      className={`rounded-xl px-6 py-3 text-center text-sm font-bold transition-opacity hover:opacity-90 ${
                        plan.is_popular ? "gold-gradient-bg text-[#0A0E1A]" : "border-card-border hover:bg-accent border"
                      }`}
                    >
                      {isFree ? t.ctaTrial : t.cta}
                    </Link>
                  </div>
                </Reveal>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
