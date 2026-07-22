import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Package } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import * as analyticsApi from "@/lib/api/analytics";
import type { CategorySalesEntry } from "@/lib/api/analytics";
import { formatMoney } from "@/lib/format/money";

const content = {
  uz: { title: "Top mahsulotlar", seeAll: "Barchasini ko'rish", sold: "Sotilgan", topBadge: "TOP", empty: "Hali savdolar mavjud emas" },
  ru: { title: "Топ товаров", seeAll: "Смотреть все", sold: "Продано", topBadge: "ТОП", empty: "Продаж пока нет" },
};

export function TopProductsCard({ accessToken, periodStart, periodEnd }: { accessToken: string; periodStart: string; periodEnd: string }) {
  const { lang } = useLang();
  const t = content[lang];
  const [entries, setEntries] = useState<CategorySalesEntry[] | null>(null);

  useEffect(() => {
    analyticsApi
      .getCourseSales(accessToken, periodStart, periodEnd)
      .then((rows) => setEntries([...rows].sort((a, b) => b.sales_count - a.sales_count)))
      .catch(() => setEntries([]));
  }, [accessToken, periodStart, periodEnd]);

  return (
    <div className="glass-card flex h-full flex-col p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t.title}</h3>
        <Link to="/dashboard/course-sales" className="text-primary text-xs font-semibold whitespace-nowrap">
          {t.seeAll}
        </Link>
      </div>

      {entries === null && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-accent/60 h-12 animate-pulse rounded-xl" />
          ))}
        </div>
      )}

      {entries !== null && entries.length === 0 && (
        <div className="flex flex-1 items-center justify-center py-6">
          <p className="text-sm text-foreground-muted">{t.empty}</p>
        </div>
      )}

      {entries !== null && entries.length > 0 && (
        <div className="space-y-1">
          {entries.slice(0, 5).map((entry, i) => (
            <div
              key={`${entry.category_id}-${entry.currency}`}
              className={`flex items-center gap-3 py-2.5 ${i < entries.length - 1 ? "border-b border-card-border/60" : ""}`}
            >
              <div className="bg-accent flex size-10 shrink-0 items-center justify-center rounded-xl">
                <Package size={17} className="text-foreground-muted" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-foreground">{entry.category_name ?? "—"}</span>
                  {i === 0 && (
                    <span className="bg-accent-orange/15 text-accent-orange shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                      {t.topBadge}
                    </span>
                  )}
                </div>
                <span className="text-xs text-foreground-muted">
                  {t.sold}: {entry.sales_count}
                </span>
              </div>
              <span className="font-mono shrink-0 text-sm font-semibold text-foreground">
                {formatMoney(entry.total_amount, entry.currency)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
