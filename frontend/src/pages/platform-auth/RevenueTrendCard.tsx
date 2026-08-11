import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLang } from "@/lib/i18n/LangContext";
import { useThemeContext } from "@/lib/theme/ThemeContext";
import * as platformDashboardApi from "@/lib/api/platformDashboard";
import type { RevenueAnalytics, RevenuePeriod } from "@/lib/api/platformDashboard";
import { formatMoney } from "@/lib/format/money";
import { categoricalPalette, CHART_AXIS_DARK, CHART_AXIS_LIGHT, CHART_GRID_DARK, CHART_GRID_LIGHT } from "@/lib/format/chartColors";

const content = {
  uz: {
    title: "Daromad dinamikasi",
    periodWeek: "Hafta",
    periodMonth: "Oy",
    periodYear: "Yil",
    topTenants: "Eng ko'p to'lagan tenantlar",
    noData: "Bu davr uchun ma'lumot yo'q",
  },
  ru: {
    title: "Динамика выручки",
    periodWeek: "Неделя",
    periodMonth: "Месяц",
    periodYear: "Год",
    topTenants: "Тенанты с наибольшей выручкой",
    noData: "Нет данных за этот период",
  },
};

// Same always-visible segmented control as SalesTrendCharts.tsx's
// PeriodSegmented (tenant dashboard) -- kept as a local copy since that one
// is typed to the tenant-analytics RevenuePeriod ("day"|"week"|"month"),
// not this platform-level one ("week"|"month"|"year").
function PeriodSegmented({
  period,
  onChange,
  options,
}: {
  period: RevenuePeriod;
  onChange: (p: RevenuePeriod) => void;
  options: { value: RevenuePeriod; label: string }[];
}) {
  return (
    <div className="bg-accent border-card-border flex shrink-0 items-center gap-0.5 rounded-lg border p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-colors ${
            opt.value === period ? "bg-accent-orange text-accent-orange-foreground" : "text-foreground-muted hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function formatBucketTick(iso: string, period: RevenuePeriod, lang: "uz" | "ru"): string {
  const d = new Date(iso);
  const locale = lang === "ru" ? "ru-RU" : "uz-UZ";
  return period === "year"
    ? d.toLocaleDateString(locale, { month: "short" })
    : d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
}

export function RevenueTrendCard({ accessToken }: { accessToken: string }) {
  const { lang } = useLang();
  const t = content[lang];
  const { isDark } = useThemeContext();
  const [period, setPeriod] = useState<RevenuePeriod>("month");
  const [data, setData] = useState<RevenueAnalytics | null>(null);

  useEffect(() => {
    setData(null);
    platformDashboardApi.getRevenueAnalytics(accessToken, period).then(setData).catch(() => setData({ buckets: [], top_tenants: [] }));
  }, [accessToken, period]);

  const currencies = useMemo(() => [...new Set((data?.buckets ?? []).map((b) => b.currency))], [data]);
  const palette = categoricalPalette(isDark);

  const chartRows = useMemo(() => {
    if (!data) return [];
    const byBucket = new Map<string, Record<string, string | number>>();
    for (const b of data.buckets) {
      const row = byBucket.get(b.bucket_start) ?? { label: formatBucketTick(b.bucket_start, period, lang) };
      row[b.currency] = b.total_amount;
      byBucket.set(b.bucket_start, row);
    }
    return [...byBucket.values()];
  }, [data, period, lang]);

  const axisColor = isDark ? CHART_AXIS_DARK : CHART_AXIS_LIGHT;
  const gridColor = isDark ? CHART_GRID_DARK : CHART_GRID_LIGHT;

  const periodOptions: { value: RevenuePeriod; label: string }[] = [
    { value: "week", label: t.periodWeek },
    { value: "month", label: t.periodMonth },
    { value: "year", label: t.periodYear },
  ];

  return (
    <div className="glass-card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t.title}</h3>
        <PeriodSegmented period={period} onChange={setPeriod} options={periodOptions} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {data !== null && chartRows.every((r) => currencies.every((c) => !r[c])) ? (
            <div className="flex h-[220px] items-center justify-center">
              <p className="text-sm text-foreground-muted">{t.noData}</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartRows} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
                <defs>
                  {currencies.map((currency, i) => (
                    <linearGradient key={currency} id={`revBarGrad-${currency}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={palette[i % palette.length]} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={palette[i % palette.length]} stopOpacity={0.15} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 6" />
                <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 11 }} axisLine={{ stroke: gridColor }} tickLine={false} minTickGap={16} />
                <YAxis tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--card-border)", borderRadius: 12, fontSize: 12 }}
                  formatter={(value, name) => formatMoney(Number(value), String(name))}
                />
                {currencies.map((currency) => (
                  <Bar
                    key={currency}
                    dataKey={currency}
                    name={currency}
                    fill={`url(#revBarGrad-${currency})`}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={28}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div>
          <h4 className="text-foreground-muted mb-3 text-xs font-semibold">{t.topTenants}</h4>
          {data === null ? (
            <div className="bg-accent/60 h-40 animate-pulse rounded-xl" />
          ) : data.top_tenants.length === 0 ? (
            <p className="text-foreground-muted py-6 text-center text-sm">{t.noData}</p>
          ) : (
            <ul className="space-y-2.5">
              {data.top_tenants.map((row, i) => (
                <li key={`${row.tenant_id}-${row.currency}`} className="flex items-center gap-2.5 text-sm">
                  <span className="bg-accent text-foreground-muted flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{row.tenant_name}</span>
                  <span className="font-mono shrink-0 text-xs font-semibold text-foreground-muted">
                    {formatMoney(row.total_amount, row.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
