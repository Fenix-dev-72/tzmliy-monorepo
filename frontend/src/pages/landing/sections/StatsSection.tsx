import { ArrowRight } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { Reveal } from "@/components/shared/Reveal";
import { CountUp } from "@/components/landing/CountUp";

// "Impressive stats" style section (reference: TeamWave/Framer template
// layout -- headline + copy on the left, a 2x2 stat grid with dividers on
// the right), rebuilt in Tizimly's own gold/blue palette instead of the
// reference's pink accent, and using the repo's existing CountUp/Reveal
// primitives instead of a separate animation library.

const content = {
  uz: {
    badge: "Raqamlarda Tizimly",
    title1: "Tizimlyning",
    titleHighlight: "kuchi",
    desc: "150 dan ortiq kompaniya savdo, moliya va CRM jarayonlarini bitta platformada boshqarish uchun Tizimlyga ishonch bildirmoqda.",
    cta: "Batafsil",
    stats: [
      { value: 150, suffix: "+", label: "kompaniya ishonch bildirmoqda", color: "var(--color-primary)" },
      { value: 12000, suffix: "+", label: "faol foydalanuvchi", color: "var(--color-secondary)" },
      { value: 500000, suffix: "+", label: "oylik operatsiya", color: "var(--color-success)" },
      { value: 99, suffix: "%", label: "mijozlar mamnuniyati", color: "var(--color-accent-orange)" },
    ],
  },
  ru: {
    badge: "Tizimly в цифрах",
    title1: "Сила",
    titleHighlight: "Tizimly",
    desc: "Более 150 компаний доверяют Tizimly управление продажами, финансами и CRM-процессами на единой платформе.",
    cta: "Подробнее",
    stats: [
      { value: 150, suffix: "+", label: "компаний доверяют нам", color: "var(--color-primary)" },
      { value: 12000, suffix: "+", label: "активных пользователей", color: "var(--color-secondary)" },
      { value: 500000, suffix: "+", label: "операций в месяц", color: "var(--color-success)" },
      { value: 99, suffix: "%", label: "удовлетворённость клиентов", color: "var(--color-accent-orange)" },
    ],
  },
};

export function StatsSection() {
  const { lang } = useLang();
  const t = content[lang];

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

        <Reveal delay={120}>
          <div className="border-card-border grid grid-cols-2 divide-x divide-y overflow-hidden rounded-3xl border [&>*]:border-card-border">
            {t.stats.map((stat, i) => (
              <div key={stat.label} className="p-7 sm:p-9">
                <div className="mb-2 text-[clamp(28px,3.2vw,38px)] font-bold" style={{ color: stat.color }}>
                  <CountUp to={stat.value} suffix={stat.suffix} durationMs={1400 + i * 150} />
                </div>
                <p className="text-foreground-muted text-sm leading-snug">{stat.label}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
