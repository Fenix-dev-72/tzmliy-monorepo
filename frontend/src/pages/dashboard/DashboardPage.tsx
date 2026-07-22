import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Activity, AlertCircle, ArrowRight, HandCoins, ShoppingCart, TrendingUp, Users } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as analyticsApi from "@/lib/api/analytics";
import type { DashboardSummary, DebtSummaryEntry, LeadQualitySummary, RevenueBucket } from "@/lib/api/analytics";
import * as financeApi from "@/lib/api/finance";
import type { ProfitSummaryEntry } from "@/lib/api/finance";
import { ApiError } from "@/lib/api/client";
import { formatMoney } from "@/lib/format/money";
import { KpiCard } from "./home/KpiCard";
import { SalesTrendCharts } from "./home/SalesTrendCharts";
import { TopSellersTable } from "./home/TopSellersTable";
import { TopProductsCard } from "./home/TopProductsCard";
import { LatestOrdersTable } from "./home/LatestOrdersTable";
import { WarehouseCard } from "./home/WarehouseCard";
import { ActiveEmployeesCard } from "./home/ActiveEmployeesCard";
import { LeadFunnel } from "./home/LeadFunnel";

const content = {
  uz: {
    greeting: "Xush kelibsiz",
    todayLabel: "Bugungi ko'rsatkichlar",
    totalSales: "Jami savdo",
    activeCustomers: "Faol mijozlar",
    debt: "Qarzdorlik",
    netProfit: "Sof foyda",
    thisWeek: "bu hafta",
    noData: "Bugun uchun ma'lumot yo'q",
    emptyStateDesc: "Sizning tenant'ingizda hali savdo yozuvlari mavjud emas. Birinchi savdoni qo'shing.",
    addSale: "Savdo qo'shish",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    retry: "Qayta urinish",
    debtOverdue: "muddati o'tgan",
  },
  ru: {
    greeting: "Добро пожаловать",
    todayLabel: "Показатели за сегодня",
    totalSales: "Всего продаж",
    activeCustomers: "Активные клиенты",
    debt: "Задолженность",
    netProfit: "Чистая прибыль",
    thisWeek: "за неделю",
    noData: "Нет данных за сегодня",
    emptyStateDesc: "В вашем тенанте пока нет записей о продажах. Добавьте первую продажу.",
    addSale: "Добавить продажу",
    loadError: "Не удалось загрузить данные",
    retry: "Повторить",
    debtOverdue: "просрочено",
  },
};

function monthToDateRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: start.toISOString(), end: now.toISOString() };
}

export function DashboardPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken, user } = useTenantAuth();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [debt, setDebt] = useState<DebtSummaryEntry[] | null>(null);
  const [leadQuality, setLeadQuality] = useState<LeadQualitySummary | null>(null);
  const [profit, setProfit] = useState<ProfitSummaryEntry[] | null>(null);
  // Separate from SalesTrendCharts' own interactive period toggle -- this is
  // a fixed 30-day fetch purely to derive the "Jami savdo" KPI card's
  // sparkline + week-over-week growth, both real numbers, not fabricated.
  const [monthSeries, setMonthSeries] = useState<RevenueBucket[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { start: periodStart, end: periodEnd } = useMemo(monthToDateRange, []);

  async function load() {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [summaryData, debtData, leadQualityData, monthSeriesData] = await Promise.all([
        analyticsApi.getSummary(accessToken),
        analyticsApi.getDebtSummary(accessToken),
        analyticsApi.getLeadQualitySummary(accessToken),
        analyticsApi.getRevenueTimeseries(accessToken, "month"),
      ]);
      setSummary(summaryData);
      setDebt(debtData);
      setLeadQuality(leadQualityData);
      setMonthSeries(monthSeriesData);
      // Net profit needs finance.view, which not every role/employee holds
      // (own-data scoping, 2026-07-22) -- fetched separately so a 403 here
      // just leaves the KPI card showing "—" instead of failing the whole
      // dashboard load.
      if (user?.permissions.includes("finance.view")) {
        financeApi
          .getProfitSummary(accessToken, periodStart, periodEnd)
          .then(setProfit)
          .catch(() => setProfit(null));
      } else {
        setProfit(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.loadError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (accessToken) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const isEmpty =
    summary && summary.total_sales_count === 0 && summary.active_customers_count === 0 && summary.top_sellers.length === 0;

  // Dominant currency = the one with the most sales, so the sparkline/growth
  // never blends UZS so'm with USD cents into one meaningless number.
  const dominantCurrency = useMemo(() => {
    if (!summary || summary.sales_by_currency.length === 0) return null;
    return [...summary.sales_by_currency].sort((a, b) => b.total_amount - a.total_amount)[0].currency;
  }, [summary]);

  // The tenant's known currencies -- from the 30-day month series (already
  // fetched for the KPI sparkline) unioned with the summary's currencies, not
  // derived from a single "today" snapshot. `summary.sales_by_currency` on
  // its own goes empty on any day with zero sales *today* (getSummary
  // defaults to a "today" window) even when the tenant has plenty of sales
  // in the last 30 days -- that emptiness was incorrectly hiding the whole
  // chart section rather than just today's data.
  const knownCurrencies = useMemo(() => {
    const set = new Set<string>();
    (monthSeries ?? []).forEach((b) => set.add(b.currency));
    (summary?.sales_by_currency ?? []).forEach((c) => set.add(c.currency));
    return [...set].sort();
  }, [monthSeries, summary]);

  const salesTrend = useMemo(() => {
    if (!monthSeries || !dominantCurrency) return { sparkline: [] as number[], growthPct: null as number | null };
    const points = monthSeries
      .filter((b) => b.currency === dominantCurrency)
      .sort((a, b) => new Date(a.bucket_start).getTime() - new Date(b.bucket_start).getTime());
    const sparkline = points.map((p) => p.sales_amount);
    if (points.length < 14) return { sparkline, growthPct: null };
    const last7 = points.slice(-7).reduce((sum, p) => sum + p.sales_amount, 0);
    const prior7 = points.slice(-14, -7).reduce((sum, p) => sum + p.sales_amount, 0);
    const growthPct = prior7 > 0 ? Math.round(((last7 - prior7) / prior7) * 1000) / 10 : null;
    return { sparkline, growthPct };
  }, [monthSeries, dominantCurrency]);

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-8">
        <div>
          <h1 className="font-heading mb-1 text-xl font-extrabold break-words text-foreground sm:text-2xl">
            {t.greeting}{user?.full_name ? `, ${user.full_name}` : ""} 👋
          </h1>
          <p className="text-sm text-foreground-muted">{t.todayLabel}</p>
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-accent/60 h-32 animate-pulse rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="glass-card flex flex-col items-center gap-4 p-10 text-center">
          <AlertCircle size={28} className="text-destructive" />
          <p className="text-sm text-foreground-muted">{error}</p>
          <button onClick={load} className="text-primary text-sm font-semibold">
            {t.retry}
          </button>
        </div>
      )}

      {!loading && !error && summary && isEmpty && (
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center sm:p-14">
          <Activity size={32} className="text-foreground-muted" />
          <h2 className="font-heading text-lg font-bold text-foreground">{t.noData}</h2>
          <p className="max-w-md text-sm text-foreground-muted">{t.emptyStateDesc}</p>
          <Link
            to="/dashboard/sales"
            className="bg-primary text-primary-foreground mt-3 flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-90"
          >
            {t.addSale}
            <ArrowRight size={15} />
          </Link>
        </div>
      )}

      {!loading && !error && summary && !isEmpty && accessToken && (
        <>
          <div className="mb-5 grid grid-cols-1 gap-4 sm:mb-6 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={ShoppingCart}
              iconColor="#9333EA"
              label={t.totalSales}
              delayMs={0}
              sparkline={salesTrend.sparkline}
              growthLabel={salesTrend.growthPct !== null ? `${Math.abs(salesTrend.growthPct)}% ${t.thisWeek}` : undefined}
              growthDirection={salesTrend.growthPct === null ? "neutral" : salesTrend.growthPct >= 0 ? "up" : "down"}
              value={
                <div className="flex flex-col gap-0.5">
                  {summary.sales_by_currency.length === 0 ? (
                    <span className="font-mono text-2xl font-bold text-foreground">{summary.total_sales_count}</span>
                  ) : (
                    summary.sales_by_currency.map((c) => (
                      <span key={c.currency} className="font-mono text-xl font-bold text-foreground">
                        {formatMoney(c.total_amount, c.currency)}
                      </span>
                    ))
                  )}
                </div>
              }
            />

            <KpiCard
              icon={Users}
              iconColor="#2563EB"
              label={t.activeCustomers}
              delayMs={60}
              value={<span className="font-mono text-2xl font-bold text-foreground">{summary.active_customers_count}</span>}
            />

            <KpiCard
              icon={HandCoins}
              iconColor="#F97316"
              label={t.debt}
              delayMs={120}
              value={
                debt && debt.length > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    {debt.map((d) => (
                      <span key={d.currency} className="font-mono text-xl font-bold text-foreground">
                        {formatMoney(d.total_outstanding, d.currency)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-foreground-muted">—</span>
                )
              }
              growthLabel={
                debt && debt.some((d) => d.overdue_count > 0)
                  ? debt
                      .filter((d) => d.overdue_count > 0)
                      .map((d) => `${formatMoney(d.overdue_amount, d.currency)} (${d.overdue_count}) ${t.debtOverdue}`)
                      .join(", ")
                  : undefined
              }
              growthDirection="down"
            />

            <KpiCard
              icon={TrendingUp}
              iconColor="#10B981"
              label={t.netProfit}
              delayMs={180}
              value={
                profit && profit.length > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    {profit.map((p) => (
                      <span key={p.currency} className="font-mono text-xl font-bold text-foreground">
                        {formatMoney(p.profit, p.currency)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-foreground-muted">—</span>
                )
              }
            />
          </div>

          <SalesTrendCharts accessToken={accessToken} currencies={knownCurrencies} />

          {leadQuality && <LeadFunnel leadQuality={leadQuality} />}

          <div className="mb-5 grid grid-cols-1 items-stretch gap-4 sm:mb-6 xl:grid-cols-3">
            <TopSellersTable accessToken={accessToken} />
            <TopProductsCard accessToken={accessToken} periodStart={periodStart} periodEnd={periodEnd} />
            <LatestOrdersTable accessToken={accessToken} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              {accessToken && <WarehouseCard accessToken={accessToken} />}
            </div>
            <ActiveEmployeesCard />
          </div>
        </>
      )}
    </main>
  );
}
