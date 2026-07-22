import type { LucideIcon } from "lucide-react";
import { Users, Workflow, Megaphone, Phone, Send, CreditCard, Wallet } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { Reveal } from "@/components/shared/Reveal";
import { ScaleToFit } from "@/components/shared/ScaleToFit";

// "Seamless Integrations" style section (reference: TeamWave/Framer
// template's orbiting-logo-bubbles block). Rebuilt with Tizimly's own, real,
// already-built integrations (backend: crm module -- AmoCRM/Bitrix24/Meta
// Ads; calls module -- UTEL; notifications module -- Telegram; billing
// module -- Click/Payme) instead of the reference's generic
// Notion/Figma/Slack/Shopify set.
//
// First pass (static scattered bubbles) was explicit feedback "juda yomon" --
// the ask was a crescent/half-moon ("yarim oy shakli") arc that continuously
// rotates ("aylanib turishi kerak"). Second pass clipped a full rotating
// ring behind a small peek-window, which only ever showed 2-3 icons and cut
// pieces off at the edges -- explicit follow-up feedback: "hamasi to'liq
// korinishi kerak" (everything must be fully visible). This version places
// all 7 icons at fixed positions along one semicircle arc (nothing clipped,
// nothing hidden), and gets its continuous motion from the whole arc gently
// swaying/rotating back and forth (`.orbit-ring`/`.orbit-counter` in
// theme.css) -- pure CSS, no animation library (see frontend/CLAUDE.md's
// "deliberately not installed" list). Each icon bubble counter-sways at the
// exact opposite rate so it stays upright while the group sways.
//
// The arc is built at a fixed "natural" pixel size (same reasoning as the
// hero dashboard mockup) and wrapped in <ScaleToFit> to shrink uniformly on
// narrow phones -- explicit feedback: on a real phone-width viewport the
// unscaled arc (472px) overflowed the screen (390-430px), pushing icons off
// both edges instead of fitting the frame.

interface IntegrationNode {
  icon: LucideIcon;
  label: string;
  color: string;
}

const NODES: IntegrationNode[] = [
  { icon: Users, label: "amoCRM", color: "#4C6FFF" },
  { icon: Workflow, label: "Bitrix24", color: "#10B981" },
  { icon: Megaphone, label: "Meta Ads", color: "#0866FF" },
  { icon: Phone, label: "UTEL", color: "#F97316" },
  { icon: Send, label: "Telegram", color: "#26A5E4" },
  { icon: CreditCard, label: "Click", color: "#00AEEF" },
  { icon: Wallet, label: "Payme", color: "#00C2FF" },
];

const ARC_RADIUS = 200;
const ARC_TOP = 28;
const BUBBLE_HALF = 28;
const ARC_WIDTH = ARC_RADIUS * 2 + BUBBLE_HALF * 2 + 16;
const ARC_HEIGHT = ARC_RADIUS + ARC_TOP + BUBBLE_HALF + 12;
const ARC_CENTER_X = ARC_WIDTH / 2;
const ARC_CENTER_Y = ARC_RADIUS + ARC_TOP;
// Evenly spread across the top semicircle (-90deg to +90deg from vertical).
const ARC_ANGLES = NODES.map((_, i) => -90 + (180 / (NODES.length - 1)) * i);

const content = {
  uz: {
    badge: "Integratsiyalar",
    title1: "Uzluksiz",
    titleHighlight: "integratsiyalar",
    desc: "AmoCRM, Bitrix24, Meta Ads, UTEL, Telegram, Click va Payme — barcha ishlatadigan xizmatlaringiz bitta platformada birlashadi.",
    cta: "Barcha integratsiyalarni ko'rish",
  },
  ru: {
    badge: "Интеграции",
    title1: "Бесшовные",
    titleHighlight: "интеграции",
    desc: "AmoCRM, Bitrix24, Meta Ads, UTEL, Telegram, Click и Payme — все ваши сервисы объединяются на одной платформе.",
    cta: "Смотреть все интеграции",
  },
};

function OrbitCrescent() {
  return (
    <div className="relative" style={{ width: ARC_WIDTH, height: ARC_HEIGHT }}>
      {/* Static dashed guide -- the same arc the icons sit on, drawn once so
          the crescent path reads clearly regardless of the sway animation. */}
      <svg
        className="text-card-border pointer-events-none absolute inset-0 opacity-60"
        width={ARC_WIDTH}
        height={ARC_HEIGHT}
        viewBox={`0 0 ${ARC_WIDTH} ${ARC_HEIGHT}`}
        fill="none"
      >
        <path
          d={`M ${ARC_CENTER_X - ARC_RADIUS} ${ARC_CENTER_Y} A ${ARC_RADIUS} ${ARC_RADIUS} 0 0 1 ${ARC_CENTER_X + ARC_RADIUS} ${ARC_CENTER_Y}`}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="3 7"
          strokeLinecap="round"
        />
      </svg>

      <div
        className="orbit-ring absolute inset-0"
        style={{ transformOrigin: `${ARC_CENTER_X}px ${ARC_CENTER_Y}px` }}
      >
        {NODES.map((node, i) => {
          const angle = ARC_ANGLES[i];
          const Icon = node.icon;
          return (
            <div
              key={node.label}
              className="absolute"
              style={{
                top: ARC_CENTER_Y,
                left: ARC_CENTER_X,
                transform: `rotate(${angle}deg) translate(0, -${ARC_RADIUS}px)`,
              }}
            >
              <div style={{ transform: `rotate(${-angle}deg)` }}>
                <div className="orbit-counter">
                  <div
                    className="border-card-border bg-card flex size-14 items-center justify-center rounded-2xl border shadow-sm"
                    style={{ marginLeft: -BUBBLE_HALF, marginTop: -BUBBLE_HALF, boxShadow: `0 8px 20px ${node.color}22` }}
                  >
                    <Icon size={22} style={{ color: node.color }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function IntegrationsSection() {
  const { lang } = useLang();
  const t = content[lang];

  return (
    <section id="integrations" className="relative overflow-hidden py-20 sm:py-28">
      <div className="relative mx-auto max-w-3xl px-6 text-center">
        <Reveal>
          <ScaleToFit naturalWidth={ARC_WIDTH} className="mb-4">
            <OrbitCrescent />
          </ScaleToFit>

          <div className="border-primary/25 bg-primary/10 mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5">
            <div className="bg-primary size-1.5 rounded-full" />
            <span className="text-primary text-[13px] font-semibold">{t.badge}</span>
          </div>

          <h2 className="font-display mb-5 text-[clamp(30px,4.5vw,46px)] leading-[1.12] font-bold tracking-tight">
            {t.title1} <span className="gold-gradient-text">{t.titleHighlight}</span>
          </h2>

          <p className="text-foreground-muted mx-auto mb-8 max-w-xl text-[15px] leading-relaxed">{t.desc}</p>

          <a
            href="#integrations"
            className="border-card-border bg-card hover:bg-accent inline-flex items-center rounded-full border px-6 py-3 text-sm font-semibold shadow-sm transition-colors"
          >
            {t.cta}
          </a>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            {NODES.map((node) => (
              <span key={node.label} className="text-foreground-muted flex items-center gap-1.5 text-xs font-medium">
                <node.icon size={13} style={{ color: node.color }} />
                {node.label}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
