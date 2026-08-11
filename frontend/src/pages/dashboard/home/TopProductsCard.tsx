import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useLang } from "@/lib/i18n/LangContext";
import { useThemeContext } from "@/lib/theme/ThemeContext";
import * as analyticsApi from "@/lib/api/analytics";
import type { ProductSalesEntry } from "@/lib/api/analytics";
import { categoricalPalette } from "@/lib/format/chartColors";

type Period = "day" | "week" | "month";

const content = {
  uz: {
    title: "Top mahsulotlar",
    seeAll: "Barchasini ko'rish",
    sold: "Sotilgan",
    unit: "dona",
    others: "Boshqalar",
    empty: "Bu davrda savdo bo'lmagan",
    day: "Kunlik",
    week: "Haftalik",
    month: "Oylik",
  },
  ru: {
    title: "Топ товаров",
    seeAll: "Смотреть все",
    sold: "Продано",
    unit: "шт",
    others: "Другое",
    empty: "За этот период продаж нет",
    day: "День",
    week: "Неделя",
    month: "Месяц",
  },
};

// Show the biggest sellers as their own slices and fold the long tail into one
// "Others" slice -- categorical hues are assigned in fixed order and never
// cycled (dataviz rule), so the slice count never exceeds the palette length.
const MAX_SLICES = 5;

// Kunlik/Haftalik/Oylik = last 24h / 7d / 30d, matching the revenue-timeseries
// toggle's own semantics elsewhere on this dashboard.
const PERIOD_DAYS: Record<Period, number> = { day: 1, week: 7, month: 30 };

function rangeFor(period: Period): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getTime() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: now.toISOString() };
}

interface Slice {
  name: string;
  units: number;
  color: string;
}

export function TopProductsCard({ accessToken, delayMs = 0 }: { accessToken: string; delayMs?: number }) {
  const { lang } = useLang();
  const { isDark } = useThemeContext();
  const t = content[lang];
  const [period, setPeriod] = useState<Period>("day");
  const [entries, setEntries] = useState<ProductSalesEntry[] | null>(null);

  useEffect(() => {
    setEntries(null);
    const { start, end } = rangeFor(period);
    analyticsApi
      .getProductSales(accessToken, start, end)
      .then((rows) => setEntries([...rows].sort((a, b) => b.units_sold - a.units_sold)))
      .catch(() => setEntries([]));
  }, [accessToken, period]);

  const { slices, total } = useMemo(() => {
    const palette = categoricalPalette(isDark);
    const rows = entries ?? [];
    const head = rows.slice(0, MAX_SLICES);
    const tail = rows.slice(MAX_SLICES);
    const built: Slice[] = head.map((r, i) => ({ name: r.product_name || "—", units: r.units_sold, color: palette[i] }));
    if (tail.length > 0) {
      built.push({ name: t.others, units: tail.reduce((sum, r) => sum + r.units_sold, 0), color: palette[MAX_SLICES] });
    }
    return { slices: built, total: built.reduce((sum, s) => sum + s.units, 0) };
  }, [entries, isDark, t.others]);

  const periods: { value: Period; label: string }[] = [
    { value: "day", label: t.day },
    { value: "week", label: t.week },
    { value: "month", label: t.month },
  ];

  return (
    <div
      className="glass-card card-hover-lift auth-card-enter flex h-full flex-col p-5 sm:p-6"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t.title}</h3>
        <Link to="/dashboard/course-sales" className="text-primary text-xs font-semibold whitespace-nowrap">
          {t.seeAll}
        </Link>
      </div>

      <div className="mb-4 flex gap-1.5">
        {periods.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setPeriod(p.value)}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              period === p.value ? "bg-accent-orange/12 text-accent-orange" : "text-foreground-muted hover:bg-accent"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {entries === null && <div className="bg-accent/60 h-40 flex-1 animate-pulse rounded-xl" />}

      {entries !== null && slices.length === 0 && (
        <div className="flex flex-1 items-center justify-center py-6">
          <p className="text-sm text-foreground-muted">{t.empty}</p>
        </div>
      )}

      {entries !== null && slices.length > 0 && (
        <div className="flex flex-1 flex-col items-center gap-4 sm:flex-row sm:items-center">
          <div className="relative h-40 w-40 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="units"
                  nameKey="name"
                  innerRadius="60%"
                  outerRadius="100%"
                  // A single slice (common on a fresh/demo tenant with one
                  // product) still gets its own start/end gap from
                  // paddingAngle even with nothing adjacent to pad against --
                  // that leaves a visible sliver missing from the ring
                  // instead of a fully closed "donut". Only pad when there's
                  // more than one slice to actually separate.
                  paddingAngle={slices.length > 1 ? 2 : 0}
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {slices.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const s = payload[0].payload as Slice;
                    const pct = total > 0 ? Math.round((s.units / total) * 100) : 0;
                    return (
                      <div className="glass-card px-3 py-2 text-xs shadow-lg">
                        <div className="font-semibold text-foreground">{s.name}</div>
                        <div className="text-foreground-muted">
                          {t.sold}: {s.units} {t.unit} · {pct}%
                        </div>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label: total units sold */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-lg font-bold text-foreground">{total}</span>
              <span className="text-[10px] text-foreground-muted">{t.unit}</span>
            </div>
          </div>

          {/* Legend doubles as the direct-label readout (identity is never color-alone). */}
          <ul className="min-w-0 flex-1 space-y-1.5 self-stretch">
            {slices.map((s) => (
              <li key={s.name} className="flex items-center gap-2 text-sm">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="min-w-0 flex-1 truncate text-foreground">{s.name}</span>
                <span className="font-mono shrink-0 text-xs font-semibold text-foreground-muted">
                  {s.units} {t.unit}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
