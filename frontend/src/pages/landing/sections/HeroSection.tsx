import type { CSSProperties } from "react";
import { Link } from "react-router";
import { ArrowRight, Phone, Send, Database, Layers, FileText, Megaphone } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";

const channels = [
  { label: "Telefon / UTEL", icon: Phone, color: "#D4AF37" },
  { label: "Telegram", icon: Send, color: "#2BA5E0" },
  { label: "AmoCRM", icon: Database, color: "#4C6FFF" },
  { label: "Bitrix24", icon: Layers, color: "#2FBF71" },
  { label: "Web forma", icon: FileText, color: "#F5A623" },
  { label: "Meta Ads", icon: Megaphone, color: "#E5484D" },
];

const translations = {
  uz: {
    badge: "Multi-tenant B2B SaaS platforma",
    title1: "Savdoni oshirmoqmisiz?",
    titleHighlight: "Mijozlarni yo'qotmang",
    desc: "Tzmliy telefon qo'ng'iroqlari, Telegram, CRM formalar va chatlardan kelgan barcha so'rovlarni avtomatik yig'ib, bitta joyda ko'rsatadi.",
    ctaPrimary: "Bepul sinab ko'ring",
    ctaSecondary: "Batafsil",
    dealWon: "Bitim yopildi",
    dealWonStat: "24 ta bugun",
  },
  ru: {
    badge: "Мультитенантная B2B SaaS платформа",
    title1: "Хотите больше продаж?",
    titleHighlight: "Не теряйте клиентов",
    desc: "Tzmliy автоматически собирает все обращения — звонки, Telegram, CRM-формы и чаты — в одном месте.",
    ctaPrimary: "Попробовать бесплатно",
    ctaSecondary: "Подробнее",
    dealWon: "Сделка закрыта",
    dealWonStat: "24 сегодня",
  },
};

const ORBIT_DURATION_S = 20;
const SPARKLES = [
  { left: "18%", delay: 0 },
  { left: "38%", delay: 0.6 },
  { left: "58%", delay: 0.3 },
  { left: "78%", delay: 0.9 },
];

function FunnelGlass() {
  return (
    <div className="relative flex flex-col items-center">
      <div className="relative mb-[-2px] h-4 w-20">
        {SPARKLES.map((s, i) => (
          <span
            key={i}
            className="bg-primary absolute bottom-0 size-1 rounded-full"
            style={{ left: s.left, animation: `rise 1.8s ease-in ${s.delay}s infinite` }}
          />
        ))}
      </div>
      <svg width="92" height="80" viewBox="0 0 92 80">
        <defs>
          <linearGradient id="funnelLiquid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F5D77A" />
            <stop offset="100%" stopColor="#D4AF37" />
          </linearGradient>
          <clipPath id="funnelClip">
            <path d="M6 6 L86 6 L52 52 L52 74 L40 74 L40 52 Z" />
          </clipPath>
        </defs>
        <path
          d="M6 6 L86 6 L52 52 L52 74 L40 74 L40 52 Z"
          fill="rgba(212,175,55,0.06)"
          stroke="#D4AF37"
          strokeOpacity="0.55"
          strokeWidth="1.5"
        />
        <rect x="6" y="28" width="80" height="46" fill="url(#funnelLiquid)" opacity="0.9" clipPath="url(#funnelClip)" />
      </svg>
    </div>
  );
}

function DealWonDrop({ t }: { t: (typeof translations)["uz"] }) {
  return (
    <div className="relative mx-auto flex flex-col items-center">
      <span className="bg-success/70 absolute top-1 -left-4 size-1 rounded-full" />
      <span className="bg-success/50 absolute -top-1 right-[-18px] size-1.5 rounded-full" />
      <span className="bg-success/40 absolute -bottom-1 left-8 size-1 rounded-full" />

      <div
        className="border-success/30 bg-success/10 relative flex flex-col items-center gap-0.5 border px-7 py-4 text-center shadow-[0_0_28px_rgba(47,191,113,0.35)]"
        style={{ borderRadius: "50% 50% 42% 42% / 62% 62% 38% 38%" }}
      >
        <span className="text-sm font-bold text-foreground">{t.dealWon}</span>
        <span className="font-mono text-success text-xs font-bold">{t.dealWonStat}</span>
      </div>
    </div>
  );
}

function IntegrationFunnelMockup({ t }: { t: (typeof translations)["uz"] }) {
  return (
    <div className="bg-background/70 border-card-border relative w-full max-w-[520px] overflow-hidden rounded-3xl border p-8 shadow-[0_24px_80px_rgba(0,0,0,0.4)] backdrop-blur-xl">
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 size-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(212,175,55,0.15) 0%, transparent 70%)" }}
      />

      <div className="relative mx-auto mb-2 flex h-[240px] w-[240px] items-center justify-center">
        <div
          className="border-primary/25 absolute size-[220px] rounded-full border"
          style={{ boxShadow: "0 0 24px rgba(212,175,55,0.12) inset" }}
        />

        {channels.map((channel, i) => (
          <div
            key={channel.label}
            className="absolute top-1/2 left-1/2 -mt-[19px] -ml-[19px]"
            style={
              {
                animation: `orbit ${ORBIT_DURATION_S}s linear infinite`,
                animationDelay: `${-(i * ORBIT_DURATION_S) / channels.length}s`,
                "--orbit-radius": "110px",
              } as CSSProperties
            }
          >
            <div
              className="flex size-[38px] items-center justify-center rounded-xl border shadow-[0_4px_16px_rgba(0,0,0,0.25)]"
              style={{ background: `${channel.color}20`, borderColor: `${channel.color}45` }}
              title={channel.label}
            >
              <channel.icon size={16} color={channel.color} strokeWidth={1.75} />
            </div>
          </div>
        ))}

        <div className="relative z-10">
          <FunnelGlass />
        </div>
      </div>

      <DealWonDrop t={t} />
    </div>
  );
}

export function HeroSection() {
  const { lang } = useLang();
  const t = translations[lang];

  return (
    <section className="relative flex items-center overflow-hidden pt-[100px] pb-16 lg:min-h-screen">
      <div
        className="pointer-events-none absolute top-[20%] left-[15%] size-[400px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(212,175,55,0.08) 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute top-[30%] right-[10%] size-[500px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(76,111,255,0.07) 0%, transparent 70%)" }}
      />

      <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-16 px-6 lg:grid-cols-2">
        <div>
          <div className="border-primary/25 bg-primary/10 mb-7 inline-flex items-center gap-2 rounded-full border px-4 py-1.5">
            <div className="bg-primary size-1.5 rounded-full" />
            <span className="text-[13px] font-semibold text-primary">{t.badge}</span>
          </div>

          <h1 className="font-heading mb-6 text-[clamp(40px,5vw,68px)] leading-[1.1] font-extrabold tracking-tight text-foreground">
            {t.title1}
            <br />
            <span className="gold-gradient-text">{t.titleHighlight}</span>
          </h1>

          <p className="mb-8 max-w-[480px] text-lg leading-[1.7] text-foreground-muted">{t.desc}</p>

          <div className="mb-8 flex flex-wrap gap-4">
            <Link
              to="/register"
              className="gold-gradient-bg flex items-center gap-2 rounded-xl px-7 py-3.5 text-[15px] font-bold text-[#0A0E1A] shadow-[0_8px_32px_rgba(212,175,55,0.35)] transition-opacity hover:opacity-90"
            >
              {t.ctaPrimary}
              <ArrowRight size={18} />
            </Link>
            <a
              href="#showcase"
              className="border-card-border flex items-center gap-2 rounded-xl border px-7 py-3.5 text-[15px] font-semibold text-foreground transition-colors hover:bg-accent"
            >
              {t.ctaSecondary}
            </a>
          </div>

          <div className="flex flex-wrap gap-3">
            {channels.map((channel) => (
              <div key={channel.label} className="flex flex-col items-center gap-1.5">
                <div
                  className="flex size-9 items-center justify-center rounded-xl border"
                  style={{ background: `${channel.color}15`, borderColor: `${channel.color}30` }}
                >
                  <channel.icon size={16} color={channel.color} strokeWidth={1.75} />
                </div>
                <span className="text-[10px] font-medium whitespace-nowrap text-foreground-muted">
                  {channel.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="hidden justify-center lg:flex">
          <IntegrationFunnelMockup t={t} />
        </div>
      </div>
    </section>
  );
}
