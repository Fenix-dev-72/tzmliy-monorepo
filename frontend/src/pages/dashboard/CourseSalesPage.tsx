import { useEffect, useState } from "react";
import { AlertCircle, BookOpen, Loader2 } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as analyticsApi from "@/lib/api/analytics";
import type { CategorySalesEntry } from "@/lib/api/analytics";
import { ApiError } from "@/lib/api/client";
import { formatMoney } from "@/lib/format/money";
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

  const [periodStart, setPeriodStart] = useState(todayIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());
  const [entries, setEntries] = useState<CategorySalesEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
