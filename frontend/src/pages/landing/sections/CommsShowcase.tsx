import { Check, ArrowRight, Send } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { Reveal } from "@/components/shared/Reveal";
import { useReveal } from "@/lib/hooks/useReveal";

// Second "feature showcase" section (reference: TeamWave/Framer template's
// "Collaboration and Communication" block -- text on the left, a large
// background table card + a smaller foreground card peeling off it on the
// right). Mirrors FeatureShowcase.tsx's layout the other way round for
// visual rhythm, and reuses the same "second card peels off the first on
// scroll reveal" mechanic (explicit feedback: "bu ham hudi shunday
// qilinadi"). Content maps to real Tizimly modules -- a payments/ledger
// table (backend: finance/billing) and the Telegram bot delivery feed
// (backend: notifications module -- per-tenant bot, category->group
// message routing, see CLAUDE.md's "Notifications (Faza 9)" section)
// instead of the reference's generic payouts/chat mockup. Swapped from a
// generic "Bildirishnomalar" card to Telegram specifically per explicit
// feedback: "tg habarlarga u bizda bor" -- it's a real, already-built
// feature, not a placeholder concept.

const content = {
  uz: {
    badge: "Telegram orqali xabarnoma",
    title1: "Jamoa va mijozlar bilan",
    titleHighlight: "uzluksiz aloqa",
    checklist: [
      "Har bir qo'ng'iroq avtomatik yozib olinadi va CRM'ga bog'lanadi",
      "To'lov va qarzdorlik haqida Telegram guruhiga real vaqtli xabar",
      "Jamoa a'zolari uchun rol asosidagi kirish huquqlari",
      "Kunlik hisobotlar PDF tarzida avtomatik yuboriladi",
    ],
    cta: "Batafsil",
    paymentsTitle: "To'lovlar",
    viewAll: "Barchasi",
    columns: { name: "MIJOZ", date: "SANA", status: "HOLAT" },
    payments: [
      { name: "Mark J. Berg", date: "07 Noy", status: "To'landi" },
      { name: "Elena Andres", date: "07 Noy", status: "To'landi" },
      { name: "Tina Dobos", date: "06 Noy", status: "Kutilmoqda" },
      { name: "Jack Dean", date: "05 Noy", status: "To'landi" },
    ],
    notifTitle: "Telegram bot",
    notifications: [
      { text: "✅ Yangi to'lov: Alisher Karimov — 12 400 000 so'm", time: "2 daqiqa oldin", color: "var(--color-success)" },
      { text: "⚠️ Bekzod Rashidov qarzdorligi oshdi", time: "14 daqiqa oldin", color: "var(--color-accent-orange)" },
      { text: "📊 Kunlik hisobot yuborildi (PDF)", time: "1 soat oldin", color: "var(--color-secondary)" },
    ],
  },
  ru: {
    badge: "Уведомления через Telegram",
    title1: "Постоянная связь с",
    titleHighlight: "командой и клиентами",
    checklist: [
      "Каждый звонок автоматически записывается и привязывается к CRM",
      "Уведомления об оплатах и задолженностях в Telegram-группу",
      "Ролевой доступ для участников команды",
      "Ежедневные отчёты автоматически отправляются в PDF",
    ],
    cta: "Подробнее",
    paymentsTitle: "Платежи",
    viewAll: "Все",
    columns: { name: "КЛИЕНТ", date: "ДАТА", status: "СТАТУС" },
    payments: [
      { name: "Марк Й. Берг", date: "07 ноя", status: "Оплачено" },
      { name: "Елена Андрес", date: "07 ноя", status: "Оплачено" },
      { name: "Тина Добос", date: "06 ноя", status: "Ожидает" },
      { name: "Джек Дин", date: "05 ноя", status: "Оплачено" },
    ],
    notifTitle: "Telegram-бот",
    notifications: [
      { text: "✅ Новый платёж: Алишер Каримов — 12 400 000 сум", time: "2 минуты назад", color: "var(--color-success)" },
      { text: "⚠️ Задолженность Бекзода Рашидова выросла", time: "14 минут назад", color: "var(--color-accent-orange)" },
      { text: "📊 Ежедневный отчёт отправлен (PDF)", time: "1 час назад", color: "var(--color-secondary)" },
    ],
  },
};

function CommsFrame({ t }: { t: (typeof content)["uz"] }) {
  const { ref, visible } = useReveal<HTMLDivElement>(0.3);

  return (
    <div
      ref={ref}
      className="border-card-border bg-card/40 relative h-[380px] overflow-hidden rounded-3xl border p-6 sm:h-[420px] sm:p-8"
    >
      <div className="glass-card absolute top-0 left-0 w-[92%] rounded-2xl p-6 sm:w-[85%]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold">{t.paymentsTitle}</h3>
          <span className="text-primary text-xs font-semibold">{t.viewAll} &rsaquo;</span>
        </div>
        <div className="text-foreground-muted mb-2 grid grid-cols-3 text-[11px] font-semibold tracking-wide uppercase">
          <span>{t.columns.name}</span>
          <span>{t.columns.date}</span>
          <span className="text-right">{t.columns.status}</span>
        </div>
        <div className="divide-card-border/60 divide-y">
          {t.payments.map((p) => (
            <div key={p.name} className="grid grid-cols-3 items-center py-3 text-sm">
              <div className="flex items-center gap-2">
                <div className="bg-secondary/15 text-secondary flex size-7 items-center justify-center rounded-full text-[11px] font-bold">
                  {p.name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <span className="font-medium">{p.name}</span>
              </div>
              <span className="text-foreground-muted">{p.date}</span>
              <span
                className="justify-self-end text-xs font-semibold"
                style={{ color: p.status === t.payments[0].status ? "var(--color-success)" : "var(--color-accent-orange)" }}
              >
                {p.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div
        className="glass-card absolute right-0 bottom-0 w-[78%] rounded-2xl p-5 transition-all duration-700 ease-out sm:w-[62%] sm:p-6"
        style={{
          transitionDelay: visible ? "400ms" : "0ms",
          opacity: visible ? 1 : 0,
          transform: visible ? "translate(0, 0) scale(1)" : "translate(30%, 45%) scale(0.94)",
        }}
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl" style={{ backgroundColor: "rgba(38,165,228,0.15)" }}>
            <Send size={15} style={{ color: "#26A5E4" }} />
          </div>
          <span className="text-sm font-bold">{t.notifTitle}</span>
          <span className="ml-auto size-2 rounded-full" style={{ backgroundColor: "var(--color-success)" }} />
        </div>
        <div className="space-y-3">
          {t.notifications.map((n) => (
            <div key={n.text} className="flex items-start gap-2.5">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ backgroundColor: n.color }} />
              <div className="min-w-0">
                <p className="truncate text-[13px] leading-tight font-medium">{n.text}</p>
                <p className="text-foreground-muted text-[11px]">{n.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CommsShowcase() {
  const { lang } = useLang();
  const t = content[lang];

  return (
    <section className="relative overflow-hidden py-20 sm:py-28">
      <div
        className="landing-glow-drift pointer-events-none absolute top-1/3 right-[10%] size-[360px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(76,111,255,0.1) 0%, transparent 70%)" }}
      />

      <div className="relative mx-auto grid max-w-6xl gap-16 px-6 lg:grid-cols-2 lg:items-center lg:gap-12">
        <Reveal className="lg:order-1">
          <div className="border-primary/25 bg-primary/10 mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5">
            <div className="bg-primary size-1.5 rounded-full" />
            <span className="text-primary text-[13px] font-semibold">{t.badge}</span>
          </div>

          <h2 className="font-display mb-7 text-[clamp(28px,4vw,42px)] leading-[1.15] font-bold tracking-tight">
            {t.title1} <span className="gold-gradient-text">{t.titleHighlight}</span>
          </h2>

          <ul className="mb-9 space-y-4">
            {t.checklist.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="bg-primary/15 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full">
                  <Check size={14} style={{ color: "var(--color-primary)" }} />
                </span>
                <span className="text-[15px] leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>

          <a
            href="#features"
            className="border-card-border hover:bg-accent inline-flex items-center gap-2 rounded-xl border px-6 py-3 text-sm font-semibold transition-colors"
          >
            {t.cta}
            <ArrowRight size={16} />
          </a>
        </Reveal>

        <Reveal delay={120} className="lg:order-2">
          <CommsFrame t={t} />
        </Reveal>
      </div>
    </section>
  );
}
