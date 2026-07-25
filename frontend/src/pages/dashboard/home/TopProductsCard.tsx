import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useLang } from "@/lib/i18n/LangContext";
import { useThemeContext } from "@/lib/theme/ThemeContext";
import * as analyticsApi from "@/lib/api/analytics";
import type { ProductSalesEntry } from "@/lib/api/analytics";
import { categoricalPalette } from "@/lib/format/chartColors";

const content = {
  uz: { title: "Top mahsulotlar", seeAll: "Barchasini ko'rish", sold: "Sotilgan", unit: "dona", others: "Boshqalar", empty: "Hali savdolar mavjud emas" },
  ru: { title: "Топ товаров", seeAll: "Смотреть все", sold: "Продано", unit: "шт", others: "Другое", empty: "Продаж пока нет" },
};

// Show the biggest sellers as their own slices and fold the long tail into one
// "Others" slice -- categorical hues are assigned in fixed order and never
// cycled (dataviz rule), so the slice count never exceeds the palette length.
const MAX_SLICES = 5;

interface Slice {
  name: string;
  units: number;
  color: string;
}

export function TopProductsCard({ accessToken, periodStart, periodEnd }: { accessToken: string; periodStart: string; periodEnd: string }) {
  const { lang } = useLang();
  const { isDark } = useThemeContext();
  const t = content[lang];
  const [entries, setEntries] = useState<ProductSalesEntry[] | null>(null);

  useEffect(() => {
    analyticsApi
      .getProductSales(accessToken, periodStart, periodEnd)
      .then((rows) => setEntries([...rows].sort((a, b) => b.units_sold - a.units_sold)))
      .catch(() => setEntries([]));
  }, [accessToken, periodStart, periodEnd]);

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

  return (
    <div className="glass-card flex h-full flex-col p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t.title}</h3>
        <Link to="/dashboard/course-sales" className="text-primary text-xs font-semibold whitespace-nowrap">
          {t.seeAll}
        </Link>
      </div>

      {entries === null && <div className="bg-accent/60 h-44 flex-1 animate-pulse rounded-xl" />}

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
                  innerRadius="62%"
                  outerRadius="100%"
                  paddingAngle={2}
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
