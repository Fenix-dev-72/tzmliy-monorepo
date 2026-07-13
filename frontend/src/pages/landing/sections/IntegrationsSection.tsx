import { useEffect, useRef } from "react";
import { useLang } from "@/lib/i18n/LangContext";
import { SectionBadge, SectionHeading } from "@/components/shared/SectionBadge";

const integrations = [
  { name: "AmoCRM", color: "#4C6FFF", letter: "A" },
  { name: "Bitrix24", color: "#2FBF71", letter: "B" },
  { name: "Telegram", color: "#2BA5E0", letter: "T" },
  { name: "Click", color: "#2FBF71", letter: "C" },
  { name: "Payme", color: "#00AAFF", letter: "P" },
  { name: "Meta Ads", color: "#1877F2", letter: "M" },
  { name: "UTEL", color: "#D4AF37", letter: "U" },
  { name: "Google Ads", color: "#E5484D", letter: "G" },
];

function IntegrationBadge({ name, color, letter }: { name: string; color: string; letter: string }) {
  return (
    <div className="bg-card border-card-border inline-flex shrink-0 items-center gap-2.5 rounded-full border px-5 py-2.5 whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.12)] backdrop-blur-md">
      <div
        className="font-heading flex size-8 items-center justify-center rounded-[10px] border text-sm font-extrabold"
        style={{ background: `${color}20`, borderColor: `${color}40`, color }}
      >
        {letter}
      </div>
      <span className="text-sm font-semibold text-foreground">{name}</span>
    </div>
  );
}

export function IntegrationsSection() {
  const { lang } = useLang();
  const sectionRef = useRef<HTMLElement>(null);
  const track1 = useRef<HTMLDivElement>(null);
  const track2 = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    let running = false;
    let raf = 0;
    let pos1 = 0;
    let pos2 = -50;

    const animate = () => {
      pos1 -= 0.035;
      pos2 -= 0.035;
      if (pos1 <= -50) pos1 = 0;
      if (pos2 <= -50) pos2 = 0;
      if (track1.current) track1.current.style.transform = `translateX(${pos1}%)`;
      if (track2.current) track2.current.style.transform = `translateX(${pos2}%)`;
      raf = requestAnimationFrame(animate);
    };

    // Only spend CPU on the marquee while it's actually visible -- avoids an
    // endless rAF loop running in the background once the user scrolls past.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !running) {
          running = true;
          raf = requestAnimationFrame(animate);
        } else if (!entry.isIntersecting && running) {
          running = false;
          cancelAnimationFrame(raf);
        }
      },
      { threshold: 0 },
    );
    if (sectionRef.current) observer.observe(sectionRef.current);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const content = {
    uz: { badge: "Integratsiyalar", title: "Sevimli vositalaringiz bilan ishlang", subtitle: "Mavjud tizimlaringizni Tzmliy bilan muammosiz ulang." },
    ru: { badge: "Интеграции", title: "Работайте с любимыми инструментами", subtitle: "Подключите ваши существующие системы к Tzmliy без усилий." },
  };
  const c = content[lang];

  const doubled = [...integrations, ...integrations, ...integrations, ...integrations];

  return (
    <section id="integrations" ref={sectionRef} className="overflow-hidden py-12 sm:py-20">
      <div className="mx-auto mb-10 max-w-7xl px-4 sm:mb-14 sm:px-6">
        <SectionHeading badge={<SectionBadge>{c.badge}</SectionBadge>} title={c.title} subtitle={c.subtitle} />
      </div>

      <div className="relative overflow-hidden">
        <div className="from-background pointer-events-none absolute inset-y-0 left-0 z-10 w-[60px] bg-gradient-to-r to-transparent sm:w-[120px]" />
        <div className="from-background pointer-events-none absolute inset-y-0 right-0 z-10 w-[60px] bg-gradient-to-l to-transparent sm:w-[120px]" />

        <div className="flex w-[200%]" style={{ willChange: "transform" }}>
          <div ref={track1} className="flex gap-4 py-2">
            {doubled.map((item, i) => (
              <IntegrationBadge key={i} {...item} />
            ))}
          </div>
          <div ref={track2} className="flex gap-4 py-2">
            {doubled.map((item, i) => (
              <IntegrationBadge key={i} {...item} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
