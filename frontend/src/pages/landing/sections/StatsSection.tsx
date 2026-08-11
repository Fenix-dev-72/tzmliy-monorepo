import { ArrowRight } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { Reveal } from "@/components/shared/Reveal";
import { CountUp } from "@/components/landing/CountUp";
import { useReveal } from "@/lib/hooks/useReveal";
import { cn } from "@/components/ui/utils";

// "Impressive stats" style section (reference: TeamWave/Framer template
// layout -- headline + copy on the left, a 2x2 stat grid with dividers on
// the right), rebuilt in Tizimly's own gold/blue palette instead of the
// reference's pink accent, and using the repo's existing CountUp/Reveal
// primitives instead of a separate animation library.

// 2026-08-11: previous copy here claimed "150+ companies trust us / 12,000+
// active users / 99% satisfaction" -- fabricated adoption numbers with zero
// real customers behind them (Tizimly is pre-launch, confirmed 0 real paid
// tenants in production as of this pass). Replaced with real, verifiable
// product-capability facts that stay true regardless of customer count --
// same visual format (CountUp grid), honest content.
const content = {
  uz: {
    badge: "Tizimly imkoniyatlari",
    title1: "Tizimlyning",
    titleHighlight: "kuchi",
    desc: "Savdo, moliya, CRM, qo'ng'iroqlar va analitikani bitta platformada birlashtirgan tayyor yechim — o'zbek bozori uchun moslashtirilgan.",
    cta: "Batafsil",
    stats: [
      { value: 5, suffix: "", label: "asosiy modul bitta platformada", color: "var(--color-primary)" },
      { value: 7, suffix: "+", label: "tayyor integratsiya", color: "var(--color-secondary)" },
      { value: 15, suffix: "", label: "kunlik bepul sinov, kartasiz", color: "var(--color-success)" },
      { value: 100, suffix: "%", label: "real vaqt rejimidagi ma'lumot", color: "var(--color-accent-orange)" },
    ],
  },
  ru: {
    badge: "Возможности Tizimly",
    title1: "Сила",
    titleHighlight: "Tizimly",
    desc: "Готовое решение, объединяющее продажи, финансы, CRM, звонки и аналитику на одной платформе — адаптировано для рынка Узбекистана.",
    cta: "Подробнее",
    stats: [
      { value: 5, suffix: "", label: "ключевых модулей в одной системе", color: "var(--color-primary)" },
      { value: 7, suffix: "+", label: "готовых интеграций", color: "var(--color-secondary)" },
      { value: 15, suffix: "", label: "дней бесплатно, без карты", color: "var(--color-success)" },
      { value: 100, suffix: "%", label: "данных в реальном времени", color: "var(--color-accent-orange)" },
    ],
  },
};

export function StatsSection() {
  const { lang } = useLang();
  const t = content[lang];
  const { ref: statsRef, visible: statsVisible } = useReveal<HTMLDivElement>(0.2);

  return (
    <section className="relative overflow-hidden py-20 sm:py-28">
      <div
        className="landing-glow-drift pointer-events-none absolute top-1/2 left-[10%] size-[420px] -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(212,175,55,0.1) 0%, transparent 70%)" }}
      />

      <div className="relative mx-auto grid max-w-6xl gap-14 px-6 lg:grid-cols-2 lg:items-center lg:gap-10">
        <Reveal>
          <div className="border-primary/25 bg-primary/10 mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5">
            <div className="bg-primary size-1.5 rounded-full" />
            <span className="text-primary text-[13px] font-semibold">{t.badge}</span>
          </div>

          <h2 className="font-display mb-5 text-[clamp(32px,4.5vw,48px)] leading-[1.12] font-bold tracking-tight">
            {t.title1} <span className="gold-gradient-text">{t.titleHighlight}</span>
          </h2>

          <p className="text-foreground-muted mb-8 max-w-md text-[17px] leading-relaxed">{t.desc}</p>

          <a
            href="#features"
            className="border-card-border hover:bg-accent inline-flex items-center gap-2 rounded-xl border px-6 py-3 text-sm font-semibold transition-colors"
          >
            {t.cta}
            <ArrowRight size={16} />
          </a>
        </Reveal>

        <div
          ref={statsRef}
          className="border-card-border grid grid-cols-2 divide-x divide-y overflow-hidden rounded-3xl border [&>*]:border-card-border"
        >
          {t.stats.map((stat, i) => (
            <div
              key={stat.label}
              className={cn("reveal-on-scroll p-7 sm:p-9", statsVisible && "is-visible")}
              style={{ transitionDelay: statsVisible ? `${120 + i * 80}ms` : "0ms" }}
            >
              <div className="mb-2 text-[clamp(28px,3.2vw,38px)] font-bold" style={{ color: stat.color }}>
                <CountUp to={stat.value} suffix={stat.suffix} durationMs={1400 + i * 150} />
              </div>
              <p className="text-foreground-muted text-sm leading-snug">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
