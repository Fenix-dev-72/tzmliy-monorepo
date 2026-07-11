import { useEffect, useRef, useState, type ComponentType } from "react";
import { Phone, Send, Smartphone, Wifi, Battery, CheckCheck } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { SectionBadge, SectionHeading } from "@/components/shared/SectionBadge";

const content = {
  uz: {
    badge: "Tur bo'yicha",
    title: "Bitta tizimda — barcha savdo jarayoni",
    subtitle: "Har bir bosqich avtomatlashtirilgan va bir-biriga bog'langan.",
    features: [
      {
        kicker: "CRM & Pipeline",
        title: "Savdo voronkasi",
        desc: "Vizual savdo voronkasi — dealsni bosqichma-bosqich kuzating, hech qaysi lead unutilib qolmaydi.",
        statValue: "$125k",
        statLabel: "daromad — 52 deal",
        color: "#D4AF37",
      },
      {
        kicker: "Mobil",
        title: "Mobil ilova",
        desc: "Yo'lda ham nazorat — dashboard, mijozlar va qo'ng'iroqlar telefoningizda, istalgan joyda.",
        statValue: "30%",
        statLabel: "tezroq javob — 24/7 kirish",
        color: "#4C6FFF",
      },
      {
        kicker: "Call-markaz",
        title: "Qo'ng'iroq integratsiyasi (UTEL)",
        desc: "Har bir qo'ng'iroq avtomatik yoziladi, davomiylik va menejer aniqlanadi.",
        statValue: "15:24",
        statLabel: "o'rtacha — 33 ming qo'ng'iroq",
        color: "#2FBF71",
      },
      {
        kicker: "Integratsiya",
        title: "Telegram va CRM integratsiyasi",
        desc: "Telegram xabarlari avtomatik lidga aylanadi va CRM'da darhol sinxronlanadi.",
        statValue: "70%",
        statLabel: "tezroq javob — 52 deal",
        color: "#2BA5E0",
      },
    ],
  },
  ru: {
    badge: "По типу",
    title: "Единая система — весь процесс продаж",
    subtitle: "Каждый этап автоматизирован и связан друг с другом.",
    features: [
      {
        kicker: "CRM и Пайплайн",
        title: "Воронка продаж",
        desc: "Визуальная воронка продаж — отслеживайте сделки по этапам, ни один лид не потеряется.",
        statValue: "$125k",
        statLabel: "выручка — 52 сделки",
        color: "#D4AF37",
      },
      {
        kicker: "Мобильное",
        title: "Мобильное приложение",
        desc: "Контроль в пути — дашборд, клиенты и звонки на вашем телефоне, где угодно.",
        statValue: "30%",
        statLabel: "быстрее — доступ 24/7",
        color: "#4C6FFF",
      },
      {
        kicker: "Колл-центр",
        title: "Интеграция звонков (UTEL)",
        desc: "Каждый звонок автоматически записывается, определяется длительность и менеджер.",
        statValue: "15:24",
        statLabel: "в среднем — 33 тыс. звонков",
        color: "#2FBF71",
      },
      {
        kicker: "Интеграция",
        title: "Интеграция Telegram и CRM",
        desc: "Сообщения Telegram автоматически становятся лидом и мгновенно синхронизируются с CRM.",
        statValue: "70%",
        statLabel: "быстрее ответ — 52 сделки",
        color: "#2BA5E0",
      },
    ],
  },
};

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

const kanbanColumns = [
  { label: "New", color: "#4C6FFF", items: [{ name: "Alisher T.", amount: "$2.4k" }, { name: "Http Shop", amount: "$890" }] },
  { label: "Contacted", color: "#F5A623", items: [{ name: "Nodira K.", amount: "$5.1k" }] },
  { label: "Negotiation", color: "#D4AF37", items: [{ name: "Oybek Co.", amount: "$12k" }] },
  { label: "Won", color: "#2FBF71", items: [{ name: "Madina LLC", amount: "$8.4k" }] },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
}

function KanbanMockup() {
  return (
    <div className="group bg-card border-card-border rounded-3xl border p-5 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-md transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground-muted">Pipeline · Iyul</span>
        <div className="flex items-center -space-x-2">
          {["#4C6FFF", "#2FBF71", "#D4AF37"].map((c, i) => (
            <div
              key={i}
              className="border-card flex size-6 items-center justify-center rounded-full border-2 text-[9px] font-bold"
              style={{ background: `${c}30`, color: c }}
            >
              {["A", "N", "B"][i]}
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {kanbanColumns.map((col) => (
          <div key={col.label} className="flex flex-col gap-1.5">
            <div className="mb-0.5 flex items-center gap-1">
              <div className="size-1.5 shrink-0 rounded-full" style={{ background: col.color }} />
              <span className="truncate text-[9px] font-semibold text-foreground-muted">{col.label}</span>
            </div>
            {col.items.map((item) => (
              <div
                key={item.name}
                className="bg-background/70 rounded-lg border p-1.5"
                style={{ borderColor: `${col.color}30` }}
              >
                <div
                  className="mb-1 flex size-4 items-center justify-center rounded-full text-[7px] font-bold"
                  style={{ background: `${col.color}25`, color: col.color }}
                >
                  {initials(item.name)}
                </div>
                <div className="truncate text-[8px] font-semibold text-foreground">{item.name}</div>
                <div className="font-mono text-[8px] font-bold" style={{ color: col.color }}>
                  {item.amount}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileAppMockup() {
  const bars = [40, 65, 50, 80, 55, 95, 70];
  return (
    <div className="flex justify-center">
      <div className="group bg-card border-card-border relative w-[230px] rounded-[2.25rem] border-[6px] shadow-[0_16px_48px_rgba(0,0,0,0.25)] transition-transform duration-500 hover:-translate-y-1.5">
        <div className="bg-card absolute top-0 left-1/2 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl" />
        <div className="bg-background/50 flex items-center justify-between rounded-t-[1.6rem] px-4 pt-3 pb-1.5">
          <span className="text-[10px] font-bold text-foreground">9:41</span>
          <div className="flex items-center gap-1">
            <Wifi size={10} className="text-foreground-muted" />
            <Battery size={10} className="text-foreground-muted" />
          </div>
        </div>
        <div className="bg-background/30 space-y-2.5 rounded-b-[1.6rem] p-4 pb-6">
          <div className="mb-1 flex items-center gap-1.5">
            <div className="bg-primary/20 flex size-5 items-center justify-center rounded-lg">
              <Smartphone size={11} className="text-primary" />
            </div>
            <span className="text-xs font-bold text-foreground">Tzmliy</span>
            <span className="text-success ml-auto flex items-center gap-1 text-[9px] font-semibold">
              <span className="bg-success size-1.5 rounded-full" />
              Live
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-card/80 border-card-border rounded-xl border p-2.5">
              <div className="text-[9px] text-foreground-muted">Daromad</div>
              <div className="font-mono text-sm font-bold text-primary">847.2M</div>
            </div>
            <div className="bg-card/80 border-card-border rounded-xl border p-2.5">
              <div className="text-[9px] text-foreground-muted">Mijozlar</div>
              <div className="font-mono text-sm font-bold text-[#4C6FFF]">2,847</div>
            </div>
          </div>
          <div className="bg-card/80 border-card-border rounded-xl border p-2.5">
            <div className="mb-1.5 text-[9px] text-foreground-muted">Haftalik savdo</div>
            <div className="flex h-9 items-end gap-1">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t"
                  style={{
                    height: `${h}%`,
                    background: i === bars.length - 1 ? "#D4AF37" : "rgba(212,175,55,0.3)",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const calls = [
  { name: "Alisher T.", duration: "15:24", missed: false, bars: [6, 12, 8, 16, 10, 14, 7] },
  { name: "Nodira K.", duration: "4:11", missed: false, bars: [10, 6, 14, 8, 12, 9, 5] },
  { name: "Bekzod R.", duration: "", missed: true, bars: [5, 5, 5, 5, 5, 5, 5] },
];

function CallLogMockup() {
  return (
    <div className="group bg-card border-card-border space-y-2.5 rounded-3xl border p-5 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-md transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground-muted">Qo'ng'iroqlar jurnali</span>
        <span className="border-success/25 bg-success/10 text-success rounded-full border px-2 py-0.5 text-[9px] font-bold">
          UTEL
        </span>
      </div>
      {calls.map((call) => (
        <div
          key={call.name}
          className="bg-background/60 border-card-border flex items-center gap-3 rounded-xl border p-2.5"
        >
          <div
            className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
              call.missed ? "bg-danger/15 text-danger" : "bg-primary/15 text-primary"
            }`}
          >
            {call.missed ? <Phone size={13} /> : initials(call.name)}
          </div>
          <div className="flex flex-1 items-end gap-[3px]">
            {call.bars.map((h, i) => (
              <div
                key={i}
                className={`w-[3px] rounded-full ${call.missed ? "bg-danger/30" : "bg-primary/50"}`}
                style={{ height: `${h}px` }}
              />
            ))}
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold text-foreground">{call.name}</div>
            <div className={`font-mono text-[11px] ${call.missed ? "text-danger font-semibold" : "text-foreground-muted"}`}>
              {call.missed ? "O'tkazib yuborilgan" : call.duration}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TelegramCrmMockup() {
  return (
    <div className="group bg-card border-card-border space-y-3 rounded-3xl border p-5 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-md transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
      <div className="mb-1 flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-full bg-[#2BA5E020]">
          <Send size={14} className="text-[#2BA5E0]" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-foreground">Tzmliy sales bot</div>
          <div className="truncate text-[10px] text-foreground-muted">@tzmliy_sales_bot</div>
        </div>
        <span className="border-success/25 bg-success/10 text-success ml-auto flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold">
          <CheckCheck size={11} />
          CRM sync
        </span>
      </div>

      <div className="flex items-end gap-2">
        <div className="bg-accent flex size-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-foreground-muted">
          M
        </div>
        <div className="bg-background/60 border-card-border max-w-[78%] rounded-2xl rounded-bl-md border p-3">
          <p className="text-[13px] text-foreground">Assalomu alaykum, narxlar haqida ma'lumot kerak edi.</p>
        </div>
      </div>

      <div className="border-primary/20 bg-primary/10 ml-8 max-w-[78%] rounded-2xl rounded-tr-md border p-3">
        <p className="text-[13px] text-foreground">Assalomu alaykum! Hozir menejerimiz siz bilan bog'lanadi.</p>
      </div>

      <div className="bg-success/5 flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] text-foreground-muted">
        <div className="bg-success size-1.5 shrink-0 rounded-full" />
        Yangi lid CRM'ga qo'shildi — <span className="font-semibold text-foreground">Alisher T.</span>
      </div>
    </div>
  );
}

const mockups: ComponentType[] = [KanbanMockup, MobileAppMockup, CallLogMockup, TelegramCrmMockup];

type Feature = (typeof content)["uz"]["features"][number];

function FeatureRow({
  feature,
  index,
  Mockup,
  reverse,
}: {
  feature: Feature;
  index: number;
  Mockup: ComponentType;
  reverse: boolean;
}) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  const num = String(index + 1).padStart(2, "0");

  return (
    <div
      ref={ref}
      className={`relative grid grid-cols-1 items-center gap-10 transition-all duration-700 ease-out md:grid-cols-2 md:pl-16 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"
      }`}
    >
      <div
        className="absolute top-0 left-0 hidden size-10 items-center justify-center rounded-full border font-mono text-xs font-bold transition-colors duration-500 md:flex"
        style={{
          background: visible ? `${feature.color}18` : "transparent",
          borderColor: visible ? `${feature.color}50` : "var(--card-border)",
          color: feature.color,
        }}
      >
        {num}
      </div>

      <div className={reverse ? "md:order-2" : ""}>
        <span className="mb-2 block text-xs font-bold tracking-wider uppercase" style={{ color: feature.color }}>
          {feature.kicker}
        </span>
        <h3 className="font-heading mb-3 text-2xl font-bold text-foreground">{feature.title}</h3>
        <p className="mb-5 max-w-md text-[15px] leading-relaxed text-foreground-muted">{feature.desc}</p>
        <div className="flex items-baseline gap-2">
          <span className="font-heading text-3xl font-extrabold" style={{ color: feature.color }}>
            {feature.statValue}
          </span>
          <span className="text-sm font-medium text-foreground-muted">{feature.statLabel}</span>
        </div>
      </div>

      <div className={reverse ? "md:order-1" : ""}>
        <Mockup />
      </div>
    </div>
  );
}

export function FeatureShowcase() {
  const { lang } = useLang();
  const c = content[lang];

  return (
    <section id="showcase" className="px-6 py-20">
      <div className="mx-auto max-w-7xl">
        <SectionHeading badge={<SectionBadge>{c.badge}</SectionBadge>} title={c.title} subtitle={c.subtitle} />

        <div className="relative">
          <div className="border-card-border absolute top-5 bottom-5 left-5 hidden w-px border-l border-dashed md:block" />

          <div className="space-y-20">
            {c.features.map((feature, i) => (
              <FeatureRow key={feature.title} feature={feature} index={i} Mockup={mockups[i]} reverse={i % 2 === 1} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
