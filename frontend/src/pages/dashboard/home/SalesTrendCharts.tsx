import { useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLang } from "@/lib/i18n/LangContext";
import { useThemeContext } from "@/lib/theme/ThemeContext";
import * as analyticsApi from "@/lib/api/analytics";
import type { RevenueBucket, RevenuePeriod } from "@/lib/api/analytics";
import { formatMoney } from "@/lib/format/money";
import { CHART_AXIS_DARK, CHART_AXIS_LIGHT, CHART_GRID_DARK, CHART_GRID_LIGHT } from "@/lib/format/chartColors";

const content = {
  uz: {
    salesDynamics: "savdolar dinamikasi",
    seriesSales: "Savdo qilindi",
    seriesCollected: "Yig'ildi",
    periodDay: "Kunlik",
    periodWeek: "Haftalik",
    periodMonth: "Oylik",
    noData: "Bu davr uchun ma'lumot yo'q",
  },
  ru: {
    salesDynamics: "динамика продаж",
    seriesSales: "Продано",
    seriesCollected: "Собрано",
    periodDay: "День",
    periodWeek: "Неделя",
    periodMonth: "Месяц",
    noData: "Нет данных за этот период",
  },
};

function formatBucketTick(iso: string, period: RevenuePeriod, lang: "uz" | "ru"): string {
  const d = new Date(iso);
  const locale = lang === "ru" ? "ru-RU" : "uz-UZ";
  return period === "day"
    ? d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
}

// Always-visible 3-way segmented control (2026-07-27 redesign) -- replaces
// the previous single-button+dropdown menu to match the new mockup, where
// Kunlik/Haftalik/Oylik sit side by side with the active one gold-filled.
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

function CurrencyChartCard({ accessToken, currency, delayMs }: { accessToken: string; currency: string; delayMs: number }) {
  const { lang } = useLang();
  const t = content[lang];
  const { isDark } = useThemeContext();
  const [period, setPeriod] = useState<RevenuePeriod>("week");
  const [timeseries, setTimeseries] = useState<RevenueBucket[] | null>(null);

  useEffect(() => {
    analyticsApi.getRevenueTimeseries(accessToken, period).then(setTimeseries).catch(() => setTimeseries([]));
  }, [accessToken, period]);

  const data = useMemo(() => {
    if (!timeseries) return [];
    return timeseries
      .filter((b) => b.currency === currency)
      .map((b) => ({
        label: formatBucketTick(b.bucket_start, period, lang),
        sales: b.sales_amount,
        collected: b.collected_amount,
      }));
  }, [timeseries, currency, period, lang]);

  const axisColor = isDark ? CHART_AXIS_DARK : CHART_AXIS_LIGHT;
  const gridColor = isDark ? CHART_GRID_DARK : CHART_GRID_LIGHT;

  const periodOptions: { value: RevenuePeriod; label: string }[] = [
    { value: "day", label: t.periodDay },
    { value: "week", label: t.periodWeek },
    { value: "month", label: t.periodMonth },
  ];

  return (
    <div className="glass-card card-hover-lift auth-card-enter p-5 sm:p-6" style={{ animationDelay: `${delayMs}ms` }}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {currency} {t.salesDynamics}
        </h3>
        <PeriodSegmented period={period} onChange={setPeriod} options={periodOptions} />
      </div>

      {timeseries !== null && data.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center">
          <p className="text-sm text-foreground-muted">{t.noData}</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
            <defs>
              {/* Gold bar fill fading toward the baseline + a soft green glow
                  under the collected line -- matches the mockup's bar+line
                  combo chart recipe exactly (accent bars, green line/dots),
                  not a generic two-series area chart. */}
              <linearGradient id={`salesBarGrad-${currency}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-orange)" stopOpacity={0.95} />
                <stop offset="100%" stopColor="var(--accent-orange)" stopOpacity={0.15} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 6" />
            <XAxis
              dataKey="label"
              tick={{ fill: axisColor, fontSize: 11 }}
              axisLine={{ stroke: gridColor }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              tick={{ fill: axisColor, fontSize: 11 }}
              tickFormatter={(v: number) => formatMoney(v, currency)}
              axisLine={false}
              tickLine={false}
              width={70}
            />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--card-border)",
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={(value) => formatMoney(Number(value), currency)}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: axisColor }} />
            <Bar dataKey="sales" name={t.seriesSales} fill={`url(#salesBarGrad-${currency})`} radius={[6, 6, 0, 0]} maxBarSize={36} />
            <Line
              type="monotone"
              dataKey="collected"
              name={t.seriesCollected}
              stroke="var(--success)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "var(--success)", strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function SalesTrendCharts({ accessToken, currencies }: { accessToken: string; currencies: string[] }) {
  if (currencies.length === 0) return null;

  return (
    <div className="mb-5 grid grid-cols-1 gap-4 sm:mb-6 lg:grid-cols-2">
      {currencies.map((currency, i) => (
        <CurrencyChartCard key={currency} accessToken={accessToken} currency={currency} delayMs={i * 60} />
      ))}
    </div>
  );
}
