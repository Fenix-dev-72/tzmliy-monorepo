import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLang } from "@/lib/i18n/LangContext";
import { useThemeContext } from "@/lib/theme/ThemeContext";
import * as analyticsApi from "@/lib/api/analytics";
import type { RevenueBucket, RevenuePeriod } from "@/lib/api/analytics";
import { formatMoney } from "@/lib/format/money";
import { categoricalPalette, CHART_AXIS_DARK, CHART_AXIS_LIGHT, CHART_GRID_DARK, CHART_GRID_LIGHT } from "@/lib/format/chartColors";

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

function PeriodDropdown({
  period,
  onChange,
  options,
}: {
  period: RevenuePeriod;
  onChange: (p: RevenuePeriod) => void;
  options: { value: RevenuePeriod; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const current = options.find((o) => o.value === period);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="bg-primary text-primary-foreground flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
      >
        {current?.label}
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="glass-card absolute top-full right-0 z-10 mt-1 w-32 overflow-hidden p-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium transition-colors ${
                opt.value === period ? "bg-primary/12 text-primary" : "text-foreground hover:bg-accent"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
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

  const palette = categoricalPalette(isDark);
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
        <PeriodDropdown period={period} onChange={setPeriod} options={periodOptions} />
      </div>

      {timeseries !== null && data.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center">
          <p className="text-sm text-foreground-muted">{t.noData}</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
            <defs>
              <linearGradient id={`salesGrad-${currency}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={palette[0]} stopOpacity={0.35} />
                <stop offset="100%" stopColor={palette[0]} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`collectedGrad-${currency}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={palette[1]} stopOpacity={0.3} />
                <stop offset="100%" stopColor={palette[1]} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={gridColor} />
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
            <Area
              type="monotone"
              dataKey="sales"
              name={t.seriesSales}
              stroke={palette[0]}
              fill={`url(#salesGrad-${currency})`}
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
            />
            <Area
              type="monotone"
              dataKey="collected"
              name={t.seriesCollected}
              stroke={palette[1]}
              fill={`url(#collectedGrad-${currency})`}
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
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
