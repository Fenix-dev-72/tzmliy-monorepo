import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { useLang } from "@/lib/i18n/LangContext";

const content = {
  uz: {
    title: "Bugun boshlang",
    subtitle: "Biznesingizni bitta kuchli platformaga o'tkazing. Demo so'rash bepul.",
    cta: "Demo so'rash",
    secondary: "Bepul boshlash",
  },
  ru: {
    title: "Начните сегодня",
    subtitle: "Переведите свой бизнес на единую мощную платформу. Демо-запрос бесплатен.",
    cta: "Запросить демо",
    secondary: "Начать бесплатно",
  },
};

export function CTASection() {
  const { lang } = useLang();
  const c = content[lang];

  return (
    <section className="px-6 py-20">
      <div
        className="border-primary/25 relative mx-auto max-w-4xl overflow-hidden rounded-[32px] border px-12 py-18 text-center backdrop-blur-xl"
        style={{
          background:
            "linear-gradient(135deg, rgba(212,175,55,0.12) 0%, rgba(17,24,60,0.5) 50%, rgba(76,111,255,0.08) 100%)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.35), inset 0 1px 0 rgba(212,175,55,0.15)",
        }}
      >
        <div
          className="pointer-events-none absolute -top-16 left-1/2 size-[300px] -translate-x-1/2 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(212,175,55,0.12) 0%, transparent 70%)" }}
        />

        <div className="border-primary/30 bg-primary/15 relative mb-7 inline-flex items-center gap-2 rounded-full border px-4 py-1.5">
          <Sparkles size={14} className="text-primary" />
          <span className="text-[13px] font-semibold text-primary">Tzmliy 2026</span>
        </div>

        <h2
          className="font-heading relative mb-5 text-[clamp(36px,5vw,64px)] font-extrabold tracking-tight"
          style={{
            background: "linear-gradient(135deg, #F5F6FA 0%, #D4AF37 60%, #F5F6FA 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {c.title}
        </h2>

        <p className="relative mx-auto mb-10 max-w-[480px] text-lg leading-relaxed text-foreground-muted">
          {c.subtitle}
        </p>

        <div className="relative flex flex-wrap justify-center gap-4">
          <Link
            to="/login"
            className="gold-gradient-bg flex items-center gap-2 rounded-2xl px-9 py-4 text-base font-bold text-[#0A0E1A] shadow-[0_12px_40px_rgba(212,175,55,0.4)] transition-opacity hover:opacity-90"
          >
            {c.cta}
            <ArrowRight size={20} />
          </Link>
          <Link
            to="/register"
            className="border-primary/25 rounded-2xl border px-9 py-4 text-base font-semibold text-primary transition-colors hover:bg-primary/10"
          >
            {c.secondary}
          </Link>
        </div>
      </div>
    </section>
  );
}
