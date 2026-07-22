import { Bell, Home, Package, Phone, Search, Settings, ShoppingCart, Users } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useReveal } from "@/lib/hooks/useReveal";
import { ScaleToFit } from "@/components/shared/ScaleToFit";
import { CountUp } from "@/components/landing/CountUp";
import { TizimlyLogo } from "@/components/layout/TizimlyLogo";

// The landing hero's animated "live dashboard" mockup (see
// pages/landing/sections/HeroSection.tsx's original comment for the full
// design rationale -- fixed "natural" width + <ScaleToFit>, no restructuring
// on narrow containers), extracted into its own shared component
// (2026-07-21) so the tenant auth pages' BrandPanel can reuse the exact same
// diorama instead of duplicating it or building a second one.
const MOCKUP_NATURAL_WIDTH = 1240;

const content = {
  uz: {
    dashTitle: "Boshqaruv paneli",
    dashDate: "Bugun, real vaqt rejimida",
    search: "Qidirish...",
    kpi1: "Bajarilgan savdolar",
    kpi2: "Jarayonda",
    kpi3: "Oylik daromad",
    thisMonth: "Shu oy",
    sales: "So'nggi savdolar",
    statuses: { active: "Faol", done: "Yakunlangan", review: "Ko'rib chiqilmoqda" },
  },
  ru: {
    dashTitle: "Панель управления",
    dashDate: "Сегодня, в реальном времени",
    search: "Поиск...",
    kpi1: "Завершённые продажи",
    kpi2: "В процессе",
    kpi3: "Доход за месяц",
    thisMonth: "Этот месяц",
    sales: "Последние продажи",
    statuses: { active: "Активно", done: "Завершено", review: "На проверке" },
  },
};

const KPI_BARS_A = [40, 55, 45, 70, 50, 82, 65, 95];
const KPI_BARS_B = [50, 42, 65, 48, 78, 55, 88, 60];
const KPI_BARS_C = [35, 60, 48, 72, 58, 66, 80, 100];

const rows = [
  { name: "Alisher Karimov", amount: "12 400 000", status: "active" as const },
  { name: "Nodira Yusupova", amount: "8 950 000", status: "done" as const },
  { name: "Bekzod Rashidov", amount: "5 100 000", status: "review" as const },
  { name: "Madina Tosheva", amount: "21 300 000", status: "active" as const },
];

const statusStyles: Record<string, string> = {
  active: "border-primary/30 bg-primary/12 text-primary",
  done: "border-success/30 bg-success/12 text-success",
  review: "border-accent-orange/30 bg-accent-orange/12 text-accent-orange",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
}

function MiniBars({ bars, color, delayBase }: { bars: number[]; color: string; delayBase: number }) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="flex h-9 items-end gap-[3px]">
      {bars.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-sm transition-[height] duration-700 ease-out"
          style={{
            height: visible ? `${h}%` : "0%",
            transitionDelay: `${delayBase + i * 55}ms`,
            background: i === bars.length - 1 ? color : `${color}33`,
          }}
        />
      ))}
    </div>
  );
}

export function DashboardMockup({ className = "" }: { className?: string }) {
  const { lang } = useLang();
  const t = content[lang];
  const navIcons = [Home, ShoppingCart, Users, Phone, Package];
  const { ref, visible } = useReveal<HTMLDivElement>(0.35);

  return (
    <div ref={ref} className={`mockup-tilt-reveal relative w-full ${visible ? "is-visible" : ""} ${className}`}>
      <div
        className="pointer-events-none absolute -top-10 left-1/2 h-[60%] w-[70%] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(212,175,55,0.14) 0%, transparent 70%)" }}
      />

      <ScaleToFit naturalWidth={MOCKUP_NATURAL_WIDTH} className="relative">
        <div className="glass-card flex !rounded-3xl overflow-hidden">
          {/* sidebar */}
          <aside className="border-card-border flex w-16 shrink-0 flex-col items-center gap-1 border-r py-5">
            <div className="mb-4">
              <TizimlyLogo size={26} gradientId="dashboardMockupLogoGrad" />
            </div>
            {navIcons.map((Icon, i) => (
              <div
                key={i}
                className={`flex size-10 items-center justify-center rounded-xl ${
                  i === 0 ? "bg-primary/15 text-primary" : "text-foreground-muted"
                }`}
              >
                <Icon size={18} />
              </div>
            ))}
            <div className="mt-auto">
              <div className="text-foreground-muted flex size-10 items-center justify-center rounded-xl">
                <Settings size={18} />
              </div>
            </div>
          </aside>

          {/* main */}
          <div className="min-w-0 flex-1 p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="min-w-0 text-left">
                <h3 className="font-heading text-foreground truncate text-xl font-bold">{t.dashTitle}</h3>
                <p className="text-foreground-muted truncate text-xs">{t.dashDate}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="border-card-border bg-background/60 flex items-center gap-2 rounded-xl border px-3 py-2">
                  <Search size={14} className="text-foreground-muted" />
                  <span className="text-foreground-muted text-xs">{t.search}</span>
                </div>
                <div className="border-card-border bg-background/60 relative flex size-9 items-center justify-center rounded-xl border">
                  <Bell size={15} className="text-foreground-muted" />
                  <span className="bg-accent-orange absolute top-2 right-2 size-1.5 rounded-full" />
                </div>
                <div className="from-primary/40 to-secondary/40 size-9 rounded-xl bg-gradient-to-br" />
              </div>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-3">
              {[
                { label: t.kpi1, value: 247, suffix: "", bars: KPI_BARS_A, color: "#D4AF37", delay: 0 },
                { label: t.kpi2, value: 89, suffix: "", bars: KPI_BARS_B, color: "#4C6FFF", delay: 120 },
                { label: t.kpi3, value: 847, suffix: "M", bars: KPI_BARS_C, color: "#2FBF71", delay: 240 },
              ].map((kpi) => (
                <div key={kpi.label} className="border-card-border bg-background/50 rounded-2xl border p-3.5 text-left">
                  <div className="text-foreground-muted mb-1 text-[11px]">{kpi.label}</div>
                  <div className="mb-0.5 text-2xl font-bold" style={{ color: kpi.color }}>
                    <CountUp to={kpi.value} suffix={kpi.suffix} />
                  </div>
                  <div className="text-foreground-muted mb-2 text-[10px]">{t.thisMonth}</div>
                  <MiniBars bars={kpi.bars} color={kpi.color} delayBase={kpi.delay} />
                </div>
              ))}
            </div>

            <div className="border-card-border bg-background/40 rounded-2xl border p-3.5 text-left">
              <div className="mb-3 text-sm font-semibold">{t.sales}</div>
              <div className="space-y-1">
                {rows.map((row) => (
                  <div key={row.name} className="grid grid-cols-[1.5fr_1fr_auto] items-center gap-2 rounded-xl px-2 py-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="from-primary/25 to-secondary/25 flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-bold">
                        {initials(row.name)}
                      </div>
                      <span className="truncate text-[13px] font-medium">{row.name}</span>
                    </div>
                    <span className="font-mono text-left text-[13px]">
                      {row.amount} <span className="text-foreground-muted text-[10px]">UZS</span>
                    </span>
                    <span
                      className={`inline-block shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusStyles[row.status]}`}
                    >
                      {t.statuses[row.status]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScaleToFit>
    </div>
  );
}
