import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BookOpen, Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import { useThemeContext } from "@/lib/theme/ThemeContext";
import * as analyticsApi from "@/lib/api/analytics";
import type { CategorySalesEntry } from "@/lib/api/analytics";
import { ApiError } from "@/lib/api/client";
import { formatMoney } from "@/lib/format/money";
import { categoricalPalette, CHART_AXIS_DARK, CHART_AXIS_LIGHT, CHART_GRID_DARK, CHART_GRID_LIGHT } from "@/lib/format/chartColors";
import { FormField } from "@/components/auth/FormField";

const content = {
  uz: {
    title: "Course sales",
    sub: "Kategoriya bo'yicha savdo statistikasi",
    periodStart: "Davr boshi",
    periodEnd: "Davr oxiri",
    noCategory: "Kategoriyasiz",
    salesCount: "savdo",
    empty: "Tanlangan davrda savdolar yo'q",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
  },
  ru: {
    title: "Course sales",
    sub: "Статистика продаж по категориям",
    periodStart: "Начало периода",
    periodEnd: "Конец периода",
    noCategory: "Без категории",
    salesCount: "продаж",
    empty: "В выбранном периоде продаж нет",
    loadError: "Не удалось загрузить данные",
  },
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function CourseSalesPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken } = useTenantAuth();
  const { isDark } = useThemeContext();

  const [periodStart, setPeriodStart] = useState(todayIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());
  const [entries, setEntries] = useState<CategorySalesEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Money is per-currency BIGINT, never mixed (UZS so'm vs USD cents) -- one
  // axis per currency, so a bar chart mixing them would compare different
  // units. Small multiples: one chart per currency, per the dataviz skill's
  // "two measures of different scale -> two charts" rule.
  const byCurrency = useMemo(() => {
    const groups = new Map<string, { name: string; amount: number; count: number }[]>();
    for (const e of entries ?? []) {
      const list = groups.get(e.currency) ?? [];
      list.push({ name: e.category_name ?? t.noCategory, amount: e.total_amount, count: e.sales_count });
      groups.set(e.currency, list);
    }
    return [...groups.entries()];
  }, [entries, t.noCategory]);

  // Color follows the category's identity (stable across re-renders/filters),
  // never its position in the array.
  const categoryColor = useMemo(() => {
    const names = [...new Set((entries ?? []).map((e) => e.category_name ?? t.noCategory))].sort();
    const palette = categoricalPalette(isDark);
    const map = new Map<string, string>();
    names.forEach((name, i) => map.set(name, palette[i % palette.length]));
    return map;
  }, [entries, isDark, t.noCategory]);

  const axisColor = isDark ? CHART_AXIS_DARK : CHART_AXIS_LIGHT;
  const gridColor = isDark ? CHART_GRID_DARK : CHART_GRID_LIGHT;

  async function load() {
    if (!accessToken) return;
    setError(null);
    try {
      setEntries(
        await analyticsApi.getCourseSales(accessToken, `${periodStart}T00:00:00`, `${periodEnd}T23:59:59`),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.loadError);
    }
  }

  useEffect(() => {
    if (accessToken) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, periodStart, periodEnd]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <h1 className="font-heading mb-1 text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
        <p className="text-sm text-foreground-muted">{t.sub}</p>
      </div>

      <div className="glass-card mb-6 flex flex-wrap items-end gap-4 p-5">
        <FormField label={t.periodStart} type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="mb-0" />
        <FormField label={t.periodEnd} type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="mb-0" />
      </div>

      {error && (
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center">
          <AlertCircle size={28} className="text-destructive" />
          <p className="text-sm text-foreground-muted">{error}</p>
        </div>
      )}

      {!error && entries === null && (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="text-primary animate-spin" />
        </div>
      )}

      {!error && entries !== null && entries.length === 0 && (
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center sm:p-14">
          <BookOpen size={32} className="text-foreground-muted" />
          <p className="text-sm text-foreground-muted">{t.empty}</p>
        </div>
      )}

      {!error && entries !== null && entries.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {byCurrency.map(([currency, rows]) => (
            <div key={currency} className="glass-card p-5">
              <h2 className="mb-4 text-sm font-bold text-foreground">
                {currency} — {t.title}
              </h2>
              <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 44)}>
                <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                  <CartesianGrid horizontal={false} stroke={gridColor} />
                  <XAxis
                    type="number"
                    tick={{ fill: axisColor, fontSize: 11 }}
                    tickFormatter={(v: number) => formatMoney(v, currency)}
                    axisLine={{ stroke: gridColor }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fill: axisColor, fontSize: 12 }}
                    axisLine={{ stroke: gridColor }}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--accent)" }}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--card-border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
                    formatter={(value, _name, item) => [
                      formatMoney(Number(value), currency),
                      `${item.payload.count} ${t.salesCount}`,
                    ]}
                  />
                  <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {rows.map((row) => (
                      <Cell key={row.name} fill={categoryColor.get(row.name)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      )}

      {!error && entries !== null && entries.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {entries.map((entry, i) => (
            <div
              key={`${entry.category_id ?? "none"}-${entry.currency}-${i}`}
              className="glass-card p-5 transition-all hover:-translate-y-1"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">{entry.category_name ?? t.noCategory}</span>
                <span className="text-xs text-foreground-muted">
                  {entry.sales_count} {t.salesCount}
                </span>
              </div>
              <span className="text-primary font-mono text-xl font-extrabold">
                {formatMoney(entry.total_amount, entry.currency)}
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
