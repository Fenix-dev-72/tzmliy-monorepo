import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Activity, AlertCircle, ArrowRight, Loader2, ShoppingCart, Users } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as analyticsApi from "@/lib/api/analytics";
import type { DashboardSummary } from "@/lib/api/analytics";
import { ApiError } from "@/lib/api/client";
import { formatMoney } from "@/lib/format/money";
import { LiveLeaderboard } from "./LiveLeaderboard";

const content = {
  uz: {
    greeting: "Xush kelibsiz",
    todayLabel: "Bugungi ko'rsatkichlar",
    totalSales: "Jami savdolar",
    activeCustomers: "Faol mijozlar",
    collected: "Yig'ilgan pul",
    salesAmount: "Savdolar summasi",
    noData: "Bugun uchun ma'lumot yo'q",
    emptyStateDesc: "Sizning tenant'ingizda hali savdo yozuvlari mavjud emas. Birinchi savdoni qo'shing.",
    addSale: "Savdo qo'shish",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    retry: "Qayta urinish",
    loading: "Yuklanmoqda...",
  },
  ru: {
    greeting: "Добро пожаловать",
    todayLabel: "Показатели за сегодня",
    totalSales: "Всего продаж",
    activeCustomers: "Активные клиенты",
    collected: "Собранные средства",
    salesAmount: "Сумма продаж",
    noData: "Нет данных за сегодня",
    emptyStateDesc: "В вашем тенанте пока нет записей о продажах. Добавьте первую продажу.",
    addSale: "Добавить продажу",
    loadError: "Не удалось загрузить данные",
    retry: "Повторить",
    loading: "Загрузка...",
  },
};

function StatCard({
  icon: Icon,
  label,
  children,
  color,
}: {
  icon: typeof ShoppingCart;
  label: string;
  children: React.ReactNode;
  color: string;
}) {
  return (
    <div className="glass-card p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <div
          className="flex size-11 items-center justify-center rounded-2xl border"
          style={{ background: `${color}15`, borderColor: `${color}30` }}
        >
          <Icon size={20} color={color} strokeWidth={1.5} />
        </div>
        <span className="text-sm font-semibold text-foreground-muted">{label}</span>
      </div>
      {children}
    </div>
  );
}

export function DashboardPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken, user } = useTenantAuth();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await analyticsApi.getSummary(accessToken);
      setSummary(data);
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
    summary &&
    summary.total_sales_count === 0 &&
    summary.active_customers_count === 0 &&
    summary.top_sellers.length === 0;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <h1 className="font-heading mb-1 text-xl font-extrabold break-words text-foreground sm:text-2xl">
          {t.greeting}
          {user?.email ? `, ${user.email}` : ""}
        </h1>
        <p className="text-sm text-foreground-muted">{t.todayLabel}</p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="text-primary animate-spin" />
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
            className="gold-gradient-bg mt-3 flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-[#0A0E1A] transition-opacity hover:opacity-90"
          >
            {t.addSale}
            <ArrowRight size={15} />
          </Link>
        </div>
      )}

      {!loading && !error && summary && !isEmpty && accessToken && (
        <>
          <div className="mb-5 grid grid-cols-1 gap-4 sm:mb-6 sm:gap-5 md:grid-cols-3">
            <StatCard icon={ShoppingCart} label={t.totalSales} color="#D4AF37">
              <span className="font-mono text-3xl font-bold text-foreground">{summary.total_sales_count}</span>
            </StatCard>

            <StatCard icon={Users} label={t.activeCustomers} color="#4C6FFF">
              <span className="font-mono text-3xl font-bold text-foreground">{summary.active_customers_count}</span>
            </StatCard>

            <StatCard icon={Activity} label={t.collected} color="#2FBF71">
              {summary.collected_by_currency.length === 0 ? (
                <span className="text-sm text-foreground-muted">—</span>
              ) : (
                <div className="flex flex-col gap-1">
                  {summary.collected_by_currency.map((c) => (
                    <span key={c.currency} className="font-mono text-xl font-bold text-foreground">
                      {formatMoney(c.total_amount, c.currency)}
                    </span>
                  ))}
                </div>
              )}
            </StatCard>
          </div>

          {summary.sales_by_currency.length > 0 && (
            <div className="glass-card mb-5 p-5 sm:mb-6 sm:p-6">
              <h3 className="mb-4 text-sm font-semibold text-foreground-muted">{t.salesAmount}</h3>
              <div className="flex flex-wrap gap-6">
                {summary.sales_by_currency.map((c) => (
                  <div key={c.currency}>
                    <span className="font-mono text-2xl font-bold text-primary">
                      {formatMoney(c.total_amount, c.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <LiveLeaderboard accessToken={accessToken} />
        </>
      )}
    </main>
  );
}
