import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Trophy } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import * as analyticsApi from "@/lib/api/analytics";
import type { LeaderboardEntry } from "@/lib/api/analytics";
import { formatMoney } from "@/lib/format/money";

const content = {
  uz: { title: "Top sotuvchilar", seeAll: "Barchasini ko'rish", rank: "#", seller: "Sotuvchi", sales: "Bugungi savdo", empty: "Hali savdolar mavjud emas" },
  ru: { title: "Топ продавцов", seeAll: "Смотреть все", rank: "#", seller: "Продавец", sales: "Продаж сегодня", empty: "Продаж пока нет" },
};

interface SellerRow {
  userId: string;
  email: string;
  salesCount: number;
  byCurrency: Record<string, number>;
}

export function TopSellersTable({ accessToken }: { accessToken: string }) {
  const { lang } = useLang();
  const t = content[lang];
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    analyticsApi.getLeaderboard(accessToken).then(setEntries).catch(() => setEntries([]));
    const unsubscribe = analyticsApi.subscribeLeaderboard(accessToken, setEntries);
    return unsubscribe;
  }, [accessToken]);

  const rows = useMemo<SellerRow[]>(() => {
    if (!entries) return [];
    const byUser = new Map<string, SellerRow>();
    for (const e of entries) {
      let row = byUser.get(e.user_id);
      if (!row) {
        row = { userId: e.user_id, email: e.user_email, salesCount: 0, byCurrency: {} };
        byUser.set(e.user_id, row);
      }
      row.salesCount += e.sales_count;
      row.byCurrency[e.currency] = (row.byCurrency[e.currency] ?? 0) + e.total_amount;
    }
    return [...byUser.values()].sort((a, b) => b.salesCount - a.salesCount);
  }, [entries]);

  const currencies = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => Object.keys(r.byCurrency).forEach((c) => set.add(c)));
    return [...set].sort();
  }, [rows]);

  return (
    <div className="glass-card flex h-full flex-col p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy size={18} className="text-accent-orange shrink-0" />
          <h3 className="text-sm font-semibold text-foreground">{t.title}</h3>
        </div>
        <Link to="/dashboard/sellers" className="text-primary text-xs font-semibold whitespace-nowrap">
          {t.seeAll}
        </Link>
      </div>

      {entries === null && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-accent/60 h-11 animate-pulse rounded-xl" />
          ))}
        </div>
      )}

      {entries !== null && rows.length === 0 && (
        <div className="flex flex-1 items-center justify-center py-6">
          <p className="text-sm text-foreground-muted">{t.empty}</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="text-foreground-muted text-xs">
                <th className="px-2 pb-2 text-left font-medium">{t.rank}</th>
                <th className="px-2 pb-2 text-left font-medium">{t.seller}</th>
                <th className="px-2 pb-2 text-right font-medium">{t.sales}</th>
                {currencies.map((c) => (
                  <th key={c} className="px-2 pb-2 text-right font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 10).map((row, i) => (
                <tr key={row.userId} className={i < rows.length - 1 ? "border-t border-card-border/60" : ""}>
                  <td className="px-2 py-2.5">
                    <span
                      className="flex size-6 items-center justify-center rounded-full text-[11px] font-bold"
                      style={{
                        background: i === 0 ? "var(--accent-orange)" : "var(--accent)",
                        color: i === 0 ? "var(--accent-orange-foreground)" : "var(--foreground-muted)",
                      }}
                    >
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="bg-primary/12 text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                        {row.email[0]?.toUpperCase()}
                      </span>
                      <span className="truncate text-foreground">{row.email}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-foreground">{row.salesCount}</td>
                  {currencies.map((c) => (
                    <td key={c} className="px-2 py-2.5 text-right font-mono text-foreground">
                      {row.byCurrency[c] ? formatMoney(row.byCurrency[c], c) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
