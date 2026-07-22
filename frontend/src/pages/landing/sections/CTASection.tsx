import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { Reveal } from "@/components/shared/Reveal";

// "Subscribe to Our Newsletter" style closing section (reference: TeamWave/
// Framer template). No newsletter backend exists in this repo (nothing in
// `app/modules/` sends marketing email) -- same "visual only, no real
// backend flow" precedent as HeroSection's "Demo so'rash" CTA (see
// frontend/CLAUDE.md's Self-service registration section). The form just
// shows a local "thanks" confirmation state on submit instead of silently
// pretending to call an API that doesn't exist.

const content = {
  uz: {
    title: "Yangiliklardan xabardor bo'ling",
    subtitle: "Tizimly'dagi yangi imkoniyatlar va yangilanishlardan birinchi bo'lib xabar toping.",
    placeholder: "email@misol.com",
    cta: "Obuna bo'lish",
    thanks: "Rahmat! Tez orada yangiliklar yuboramiz.",
  },
  ru: {
    title: "Будьте в курсе новостей",
    subtitle: "Узнавайте о новых возможностях и обновлениях Tizimly первыми.",
    placeholder: "email@example.com",
    cta: "Подписаться",
    thanks: "Спасибо! Скоро пришлём новости.",
  },
};

export function CTASection() {
  const { lang } = useLang();
  const t = content[lang];
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitted(true);
  }

  return (
    <section id="contact" className="relative overflow-hidden py-20 sm:py-28">
      <div
        className="landing-glow-drift pointer-events-none absolute top-0 left-1/2 h-[400px] w-[900px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: "radial-gradient(ellipse, rgba(212,175,55,0.12) 0%, transparent 70%)" }}
      />

      <div className="relative mx-auto max-w-2xl px-6 text-center">
        <Reveal>
          <h2 className="font-display mb-4 text-[clamp(30px,4.5vw,46px)] leading-[1.15] font-bold tracking-tight">
            {t.title}
          </h2>
          <p className="text-foreground-muted mb-9 text-[15px] leading-relaxed">{t.subtitle}</p>

          {submitted ? (
            <p className="text-primary text-sm font-semibold">{t.thanks}</p>
          ) : (
            <form onSubmit={handleSubmit} className="mx-auto flex max-w-md flex-col gap-3 sm:flex-row">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.placeholder}
                className="border-card-border bg-card/60 placeholder:text-foreground-muted focus:border-primary flex-1 rounded-full border px-5 py-3 text-sm outline-none"
              />
              <button
                type="submit"
                className="gold-gradient-bg flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold whitespace-nowrap text-[#0A0E1A] transition-opacity hover:opacity-90"
              >
                {t.cta}
                <ArrowRight size={16} />
              </button>
            </form>
          )}
        </Reveal>
      </div>
    </section>
  );
}
