import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { useLang } from "@/lib/i18n/LangContext";
import { useReveal, revealClass } from "@/lib/hooks/useReveal";

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
  const { ref, visible } = useReveal<HTMLDivElement>();

  return (
    <section className="px-4 py-12 sm:px-6 sm:py-20">
      <div
        ref={ref}
        className={revealClass(
          visible,
          "animate-gradient-border border-primary/25 relative mx-auto max-w-4xl overflow-hidden rounded-2xl border px-5 py-10 text-center backdrop-blur-xl sm:rounded-[32px] sm:px-12 sm:py-14",
        )}
        style={{
          background:
            "linear-gradient(135deg, rgba(212,175,55,0.12) 0%, rgba(17,24,60,0.5) 50%, rgba(76,111,255,0.08) 100%)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.35), inset 0 1px 0 rgba(212,175,55,0.15)",
        }}
      >
        <div
          className="pointer-events-none absolute -top-16 left-1/2 size-[200px] -translate-x-1/2 rounded-full sm:size-[300px]"
          style={{ background: "radial-gradient(circle, rgba(212,175,55,0.12) 0%, transparent 70%)" }}
        />

        <div className="border-primary/30 bg-primary/15 relative mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1 sm:mb-7 sm:px-4 sm:py-1.5">
          <Sparkles size={14} className="text-primary" />
          <span className="text-[12px] font-semibold text-primary sm:text-[13px]">Tzmliy 2026</span>
        </div>

        <h2
          className="font-heading relative mb-4 text-[clamp(28px,5vw,64px)] font-extrabold tracking-tight sm:mb-5"
          style={{
            background: "linear-gradient(135deg, #F5F6FA 0%, #D4AF37 60%, #F5F6FA 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {c.title}
        </h2>

        <p className="relative mx-auto mb-7 max-w-[480px] text-base leading-relaxed text-foreground-muted sm:mb-10 sm:text-lg">
          {c.subtitle}
        </p>

        <div className="relative flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-4">
          <Link
            to="/login"
            className="gold-gradient-bg flex w-full items-center justify-center gap-2 rounded-xl px-7 py-3.5 text-base font-bold text-[#0A0E1A] shadow-[0_12px_40px_rgba(212,175,55,0.4)] transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90 active:scale-[0.97] sm:w-auto sm:rounded-2xl sm:px-9 sm:py-4"
          >
            {c.cta}
            <ArrowRight size={20} />
          </Link>
          <Link
            to="/register"
            className="border-primary/25 w-full rounded-xl border px-7 py-3.5 text-base font-semibold text-primary transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/10 active:scale-[0.97] sm:w-auto sm:rounded-2xl sm:px-9 sm:py-4"
          >
            {c.secondary}
          </Link>
        </div>
      </div>
    </section>
  );
}
