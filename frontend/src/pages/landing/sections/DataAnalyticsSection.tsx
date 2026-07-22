import { ArrowRight, FileText, FileSpreadsheet, FileType } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { Reveal } from "@/components/shared/Reveal";

// "Data and Document Management" style section (reference: TeamWave/Framer
// template's centered-heading + two-large-cards block, each card = a mockup
// on top with a title/description/CTA below, inside the same frame). Rebuilt
// around two real Tizimly modules -- reports/export (CSV/XLSX/PDF, backend:
// reports module) and revenue analytics (backend: analytics module's
// Kunlik/Haftalik/Oylik revenue-timeseries) -- instead of the reference's
// generic file-manager + budget-chart mockups, in Tizimly's gold/blue
// palette instead of its pink accent.

const content = {
  uz: {
    badge: "Imkoniyatlar",
    title: "Ma'lumot va hisobotlar boshqaruvi",
    exports: {
      cardTitle: "So'nggi eksportlar",
      viewAll: "Barchasi",
      columns: { file: "FAYL", size: "HAJMI", format: "FORMAT", date: "SANA" },
      rows: [
        { name: "Mijozlar ro'yxati", size: "340 KB", format: "CSV", date: "27 Noy", kind: "csv" as const },
        { name: "Savdolar hisoboti", size: "512 KB", format: "XLSX", date: "25 Noy", kind: "xlsx" as const },
        { name: "Moliya balansi", size: "180 KB", format: "PDF", date: "20 Noy", kind: "pdf" as const },
        { name: "Qo'ng'iroqlar tarixi", size: "96 KB", format: "CSV", date: "18 Noy", kind: "csv" as const },
      ],
      title: "Hisobot va eksport",
      desc: "Mijozlar, savdo, moliya va qo'ng'iroqlar bo'yicha ma'lumotlarni bir necha soniyada CSV yoki Excel formatida yuklab oling.",
      cta: "Batafsil",
    },
    analytics: {
      cardTitle: "Daromad dinamikasi",
      periods: ["Kunlik", "Haftalik", "Oylik"],
      activePeriod: 1,
      yLabels: ["12M", "9M", "6M", "3M", "0"],
      xLabels: ["Dush", "Sesh", "Chor", "Pay", "Jum", "Shan", "Yak"],
      title: "Analitika va real vaqtli hisobot",
      desc: "Kunlik, haftalik va oylik davrlar bo'yicha daromad, qarzdorlik va jamoa samaradorligini kuzatib boring.",
      cta: "Batafsil",
    },
  },
  ru: {
    badge: "Возможности",
    title: "Управление данными и отчётами",
    exports: {
      cardTitle: "Последние экспорты",
      viewAll: "Все",
      columns: { file: "ФАЙЛ", size: "РАЗМЕР", format: "ФОРМАТ", date: "ДАТА" },
      rows: [
        { name: "Список клиентов", size: "340 КБ", format: "CSV", date: "27 ноя", kind: "csv" as const },
        { name: "Отчёт по продажам", size: "512 КБ", format: "XLSX", date: "25 ноя", kind: "xlsx" as const },
        { name: "Финансовый баланс", size: "180 КБ", format: "PDF", date: "20 ноя", kind: "pdf" as const },
        { name: "История звонков", size: "96 КБ", format: "CSV", date: "18 ноя", kind: "csv" as const },
      ],
      title: "Отчёты и экспорт",
      desc: "Выгружайте данные по клиентам, продажам, финансам и звонкам за секунды в формате CSV или Excel.",
      cta: "Подробнее",
    },
    analytics: {
      cardTitle: "Динамика дохода",
      periods: ["День", "Неделя", "Месяц"],
      activePeriod: 1,
      yLabels: ["12М", "9М", "6М", "3М", "0"],
      xLabels: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
      title: "Аналитика и отчёты в реальном времени",
      desc: "Следите за доходом, задолженностью и эффективностью команды за день, неделю и месяц.",
      cta: "Подробнее",
    },
  },
};

const fileIcons = { csv: FileText, xlsx: FileSpreadsheet, pdf: FileType };
const fileIconColor = { csv: "var(--color-secondary)", xlsx: "var(--color-success)", pdf: "var(--color-accent-orange)" };

function ExportsCard({ t }: { t: (typeof content)["uz"]["exports"] }) {
  return (
    <div className="border-card-border bg-card/40 flex h-full flex-col rounded-3xl border p-6 sm:p-8">
      <div className="glass-card rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold">{t.cardTitle}</h3>
          <span className="text-primary text-xs font-semibold">{t.viewAll} &rsaquo;</span>
        </div>
        <div className="text-foreground-muted mb-2 grid grid-cols-[1fr_auto_auto_auto] gap-4 text-[10px] font-semibold tracking-wide uppercase">
          <span>{t.columns.file}</span>
          <span>{t.columns.size}</span>
          <span>{t.columns.format}</span>
          <span>{t.columns.date}</span>
        </div>
        <div className="divide-card-border/60 divide-y">
          {t.rows.map((row) => {
            const Icon = fileIcons[row.kind];
            return (
              <div key={row.name} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 py-3 text-sm">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Icon size={16} className="shrink-0" style={{ color: fileIconColor[row.kind] }} />
                  <span className="truncate font-medium">{row.name}</span>
                </div>
                <span className="text-foreground-muted text-xs">{row.size}</span>
                <span className="text-foreground-muted text-xs">{row.format}</span>
                <span className="text-foreground-muted text-xs">{row.date}</span>
              </div>
            );
          })}
        </div>
      </div>

      <h3 className="mt-8 mb-3 text-xl font-bold">{t.title}</h3>
      <p className="text-foreground-muted mb-6 flex-1 text-[15px] leading-relaxed">{t.desc}</p>
      <a href="#features" className="text-primary inline-flex items-center gap-1.5 text-sm font-semibold hover:opacity-80">
        {t.cta}
        <ArrowRight size={14} />
      </a>
    </div>
  );
}

function AnalyticsCard({ t }: { t: (typeof content)["uz"]["analytics"] }) {
  return (
    <div className="border-card-border bg-card/40 flex h-full flex-col rounded-3xl border p-6 sm:p-8">
      <div className="glass-card rounded-2xl p-5">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-bold">{t.cardTitle}</h3>
          <div className="border-card-border bg-background/40 flex items-center gap-0.5 rounded-full border p-0.5">
            {t.periods.map((p, i) => (
              <span
                key={p}
                className={
                  i === t.activePeriod
                    ? "bg-primary text-primary-foreground rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    : "text-foreground-muted px-2.5 py-1 text-[11px] font-medium"
                }
              >
                {p}
              </span>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <div className="text-foreground-muted flex flex-col justify-between py-1 text-[10px]">
            {t.yLabels.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
          <svg viewBox="0 0 320 140" className="h-[140px] w-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="revenueLineGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-primary)" />
                <stop offset="100%" stopColor="var(--color-secondary)" />
              </linearGradient>
              <linearGradient id="revenueFillGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-secondary)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--color-secondary)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0,110 L45,90 L90,100 L135,60 L180,75 L225,20 L270,35 L320,25 L320,140 L0,140 Z"
              fill="url(#revenueFillGrad)"
            />
            <path
              d="M0,110 L45,90 L90,100 L135,60 L180,75 L225,20 L270,35 L320,25"
              fill="none"
              stroke="url(#revenueLineGrad)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="text-foreground-muted mt-2 flex justify-between pl-6 text-[10px]">
          {t.xLabels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      </div>

      <h3 className="mt-8 mb-3 text-xl font-bold">{t.title}</h3>
      <p className="text-foreground-muted mb-6 flex-1 text-[15px] leading-relaxed">{t.desc}</p>
      <a href="#features" className="text-primary inline-flex items-center gap-1.5 text-sm font-semibold hover:opacity-80">
        {t.cta}
        <ArrowRight size={14} />
      </a>
    </div>
  );
}

export function DataAnalyticsSection() {
  const { lang } = useLang();
  const t = content[lang];

  return (
    <section className="relative overflow-hidden py-20 sm:py-28">
      <div
        className="landing-glow-drift pointer-events-none absolute top-0 left-1/2 h-[400px] w-[800px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: "radial-gradient(ellipse, rgba(212,175,55,0.1) 0%, transparent 70%)" }}
      />

      <div className="relative mx-auto max-w-6xl px-6">
        <Reveal className="mx-auto mb-14 max-w-2xl text-center">
          <div className="border-primary/25 bg-primary/10 mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5">
            <div className="bg-primary size-1.5 rounded-full" />
            <span className="text-primary text-[13px] font-semibold">{t.badge}</span>
          </div>
          <h2 className="font-display text-[clamp(28px,4.2vw,44px)] leading-[1.15] font-bold tracking-tight">
            {t.title}
          </h2>
        </Reveal>

        <div className="grid gap-6 lg:grid-cols-2">
          <Reveal>
            <ExportsCard t={t.exports} />
          </Reveal>
          <Reveal delay={120}>
            <AnalyticsCard t={t.analytics} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
