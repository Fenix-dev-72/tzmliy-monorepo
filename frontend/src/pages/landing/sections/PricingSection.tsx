import { useState } from "react";
import { Link } from "react-router";
import { Building2, Check, Crown, Zap } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { SectionBadge } from "@/components/shared/SectionBadge";
import { useReveal, revealClass } from "@/lib/hooks/useReveal";

const content = {
  uz: {
    badge: "Tariflar",
    title: "Biznesingizga mos tarif",
    subtitle: "Har qanday hajmdagi kompaniya uchun. Istalgan vaqt o'zgartirish mumkin.",
    monthly: "Oylik",
    recommended: "Tavsiya etiladi",
    toggle: { uzs: "UZS", usd: "USD" },
    plans: [
      {
        icon: Zap,
        name: "Boshlang'ich",
        price: { uzs: "490 000", usd: "39" },
        desc: "Kichik jamoalar va startaplar uchun",
        features: ["5 ta foydalanuvchi", "CRM: 500 lead/oy", "Moliyaviy hisobot", "Email qo'llab-quvvatlash", "1 GB saqlash", "Asosiy integratsiyalar"],
        highlight: false,
      },
      {
        icon: Building2,
        name: "Biznes",
        price: { uzs: "1 490 000", usd: "119" },
        desc: "O'sayotgan kompaniyalar uchun",
        features: ["25 ta foydalanuvchi", "CRM: cheksiz leadlar", "To'liq ledger va refund", "UTEL qo'ng'iroq integratsiyasi", "Live Dashboard & Leaderboard", "10 GB saqlash", "Barcha integratsiyalar", "Prioritet qo'llab-quvvatlash"],
        highlight: true,
      },
      {
        icon: Crown,
        name: "Korporativ",
        price: { uzs: "Aloqa qiling", usd: "Contact us" },
        desc: "Yirik korporatsiyalar uchun",
        features: ["Cheksiz foydalanuvchilar", "Dedicated server", "SLA 99.95%", "RPO=0 kafolati", "Custom integratsiyalar", "Maxsus API kirish", "Shaxsiy menejer", "24/7 telefon qo'llab-quvvatlash"],
        highlight: false,
      },
    ],
    cta: { start: "Boshlash", contact: "Aloqa qilish" },
  },
  ru: {
    badge: "Тарифы",
    title: "Тариф для вашего бизнеса",
    subtitle: "Для компаний любого размера. Можно изменить в любое время.",
    monthly: "В месяц",
    recommended: "Рекомендуется",
    toggle: { uzs: "UZS", usd: "USD" },
    plans: [
      {
        icon: Zap,
        name: "Начальный",
        price: { uzs: "490 000", usd: "39" },
        desc: "Для небольших команд и стартапов",
        features: ["5 пользователей", "CRM: 500 лидов/мес", "Финансовая отчётность", "Email поддержка", "1 ГБ хранилища", "Базовые интеграции"],
        highlight: false,
      },
      {
        icon: Building2,
        name: "Бизнес",
        price: { uzs: "1 490 000", usd: "119" },
        desc: "Для растущих компаний",
        features: ["25 пользователей", "CRM: безлимитные лиды", "Полный леджер и возвраты", "Интеграция звонков UTEL", "Live Dashboard & Leaderboard", "10 ГБ хранилища", "Все интеграции", "Приоритетная поддержка"],
        highlight: true,
      },
      {
        icon: Crown,
        name: "Корпоративный",
        price: { uzs: "Свяжитесь", usd: "Contact us" },
        desc: "Для крупных корпораций",
        features: ["Неограниченные пользователи", "Выделенный сервер", "SLA 99.95%", "Гарантия RPO=0", "Кастомные интеграции", "Специальный API доступ", "Персональный менеджер", "Телефонная поддержка 24/7"],
        highlight: false,
      },
    ],
    cta: { start: "Начать", contact: "Связаться" },
  },
};

const NOT_CONTACT = new Set(["Aloqa qiling", "Contact us", "Свяжитесь"]);

export function PricingSection() {
  const { lang } = useLang();
  const [currency, setCurrency] = useState<"uzs" | "usd">("uzs");
  const c = content[lang];
  const { ref, visible } = useReveal<HTMLDivElement>();

  return (
    <section id="pricing" className="px-4 py-12 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 text-center sm:mb-14">
          <div className="mb-4 flex justify-center">
            <SectionBadge>{c.badge}</SectionBadge>
          </div>
          <h2 className="font-heading mb-3 text-[clamp(28px,4vw,48px)] font-extrabold tracking-tight text-foreground">
            {c.title}
          </h2>
          <p className="mb-6 text-base text-foreground-muted sm:mb-8 sm:text-[17px]">{c.subtitle}</p>

          <div className="bg-background/80 border-card-border animate-shimmer inline-flex rounded-xl border p-1">
            {(["uzs", "usd"] as const).map((cur) => (
              <button
                key={cur}
                onClick={() => setCurrency(cur)}
                className={`rounded-lg px-6 py-2 text-sm font-bold transition-all ${
                  currency === cur ? "bg-primary/15 text-primary" : "text-foreground-muted"
                }`}
              >
                {c.toggle[cur]}
              </button>
            ))}
          </div>
        </div>

        <div ref={ref} className="grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-3">
          {c.plans.map((plan, i) => (
            <div
              key={i}
              className={revealClass(
                visible,
                `relative rounded-2xl border p-6 backdrop-blur-md hover:-translate-y-2 hover:duration-300 sm:rounded-3xl sm:p-9 ${
                  plan.highlight
                    ? "border-primary bg-primary/[0.07] border-2 shadow-[0_16px_48px_rgba(212,175,55,0.15)] hover:shadow-[0_24px_64px_rgba(212,175,55,0.25)] md:scale-[1.02]"
                    : "bg-card border-card-border shadow-[0_8px_32px_rgba(0,0,0,0.15)] hover:shadow-[0_16px_48px_rgba(0,0,0,0.25)]"
                }`,
              )}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              {plan.highlight && (
                <div className="gold-gradient-bg absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-xs font-bold whitespace-nowrap text-[#0A0E1A]">
                  {c.recommended}
                </div>
              )}

              <div className="mb-5 flex items-center gap-3 sm:mb-7">
                <div
                  className={`flex size-11 items-center justify-center rounded-xl ${plan.highlight ? "bg-primary/20" : "bg-accent"}`}
                >
                  <plan.icon size={22} className={plan.highlight ? "text-primary" : "text-foreground-muted"} />
                </div>
                <div>
                  <h3 className="font-heading text-lg font-bold text-foreground">{plan.name}</h3>
                  <p className="text-[13px] text-foreground-muted">{plan.desc}</p>
                </div>
              </div>

              <div className="mb-5 flex items-baseline gap-1.5 sm:mb-7">
                <span className="font-mono text-2xl font-bold text-foreground sm:text-[32px]">{plan.price[currency]}</span>
                {!NOT_CONTACT.has(plan.price[currency]) && (
                  <span className="text-[13px] text-foreground-muted">
                    / {c.monthly} {currency === "uzs" ? "UZS" : "USD"}
                  </span>
                )}
              </div>

              <div className="mb-7">
                {plan.features.map((feature, j) => (
                  <div key={j} className="flex gap-2.5 py-2">
                    <div
                      className={`mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full ${
                        plan.highlight ? "bg-primary/20" : "bg-success/15"
                      }`}
                    >
                      <Check size={11} className={plan.highlight ? "text-primary" : "text-success"} strokeWidth={2.5} />
                    </div>
                    <span className="text-sm text-foreground">{feature}</span>
                  </div>
                ))}
              </div>

              {i === 2 ? (
                <a
                  href="#contact"
                  className="border-card-border block w-full rounded-xl border py-3.5 text-center text-[15px] font-bold text-foreground transition-all hover:scale-[1.02] hover:bg-accent"
                >
                  {c.cta.contact}
                </a>
              ) : (
                <Link
                  to="/register"
                  className={`block w-full rounded-xl py-3.5 text-center text-[15px] font-bold transition-all hover:scale-[1.02] ${
                    plan.highlight
                      ? "gold-gradient-bg text-[#0A0E1A] shadow-[0_8px_24px_rgba(212,175,55,0.3)] hover:shadow-[0_12px_32px_rgba(212,175,55,0.4)]"
                      : "border-card-border border text-foreground hover:bg-accent"
                  }`}
                >
                  {c.cta.start}
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
