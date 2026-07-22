import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { useLang } from "@/lib/i18n/LangContext";
import { Reveal } from "@/components/shared/Reveal";
import { DashboardMockup } from "@/components/shared/DashboardMockup";

// Hero (2026-07-20 rebuild) -- big centered headline + CTAs over a soft
// ambient glow, with an animated "live dashboard" mockup card below it
// (reference: TeamWave/Framer template layout, kept in the existing
// Tizimly gold/blue palette). All animation is plain CSS (.reveal-on-scroll,
// width/height transitions) -- no animation library, 60fps-safe transforms
// only.
//
// The dashboard mockup itself was extracted into
// components/shared/DashboardMockup.tsx (2026-07-21) so the tenant auth
// pages' BrandPanel could reuse the exact same diorama instead of a second
// build of it -- see that file for the ScaleToFit/fixed-width rationale.

const content = {
  uz: {
    badge: "Multi-tenant B2B SaaS platforma",
    title1: "Biznesingizni",
    titleHighlight: "bitta tizimda",
    title2: "boshqaring.",
    desc: "Savdo, moliya, CRM, qo'ng'iroqlar va analitika — barcha jarayonlaringiz bitta joyda, real vaqt rejimida.",
    ctaPrimary: "Bepul boshlash",
    ctaSecondary: "Batafsil",
  },
  ru: {
    badge: "Мультитенантная B2B SaaS платформа",
    title1: "Управляйте бизнесом",
    titleHighlight: "в единой",
    title2: "системе.",
    desc: "Продажи, финансы, CRM, звонки и аналитика — все процессы в одном месте, в реальном времени.",
    ctaPrimary: "Начать бесплатно",
    ctaSecondary: "Подробнее",
  },
};

export function HeroSection() {
  const { lang } = useLang();
  const t = content[lang];

  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40">
      <div
        className="landing-glow-drift pointer-events-none absolute top-[5%] left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: "radial-gradient(ellipse, rgba(212,175,55,0.14) 0%, transparent 70%)" }}
      />
      <div
        className="landing-glow-drift pointer-events-none absolute top-[10%] right-[8%] size-[300px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(76,111,255,0.1) 0%, transparent 70%)", animationDelay: "-8s" }}
      />

      <div className="relative mx-auto max-w-4xl px-6 text-center">
        <Reveal className="border-primary/25 bg-primary/10 mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5">
          <div className="bg-primary size-1.5 rounded-full" />
          <span className="text-primary text-[13px] font-semibold">{t.badge}</span>
        </Reveal>

        <Reveal delay={80}>
          <h1 className="font-display mb-6 text-[clamp(36px,6vw,68px)] leading-[1.08] font-bold tracking-tight">
            {t.title1} <span className="gold-gradient-text">{t.titleHighlight}</span> {t.title2}
          </h1>
        </Reveal>

        <Reveal delay={160}>
          <p className="text-foreground-muted mx-auto mb-9 max-w-xl text-lg leading-relaxed">{t.desc}</p>
        </Reveal>

        <Reveal delay={220} className="mb-16 flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/register"
            className="gold-gradient-bg flex items-center gap-2 rounded-xl px-7 py-3.5 text-[15px] font-bold text-[#0A0E1A] shadow-[0_8px_32px_rgba(212,175,55,0.35)] transition-opacity hover:opacity-90"
          >
            {t.ctaPrimary}
            <ArrowRight size={18} />
          </Link>
          <a
            href="#features"
            className="border-card-border hover:bg-accent rounded-xl border px-7 py-3.5 text-[15px] font-semibold transition-colors"
          >
            {t.ctaSecondary}
          </a>
        </Reveal>
      </div>

      <DashboardMockup className="mx-auto mt-20 max-w-[1320px] px-4 sm:mt-28 sm:px-6" />
    </section>
  );
}
