import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronRight, Loader2, Trophy } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import { useThemeContext } from "@/lib/theme/ThemeContext";
import * as usersApi from "@/lib/api/users";
import { USERS_DROPDOWN_LIMIT } from "@/lib/api/users";
import type { TenantUserRow } from "@/lib/api/users";
import * as analyticsApi from "@/lib/api/analytics";
import type { LeaderboardEntry } from "@/lib/api/analytics";
import { ApiError } from "@/lib/api/client";
import { formatMoney } from "@/lib/format/money";
import { CHART_AXIS_DARK, CHART_AXIS_LIGHT, CHART_GRID_DARK, CHART_GRID_LIGHT } from "@/lib/format/chartColors";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SellerSummaryDialog } from "./SellerSummaryDialog";
import { SellerKpiDashboard } from "./SellerKpiDashboard";

const content = {
  uz: {
    title: "Sotuvchilar",
    sub: "Bugungi kun bo'yicha xodimlar reytingi",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    empty: "Bugun hali savdolar mavjud emas",
    role: "Rol",
  },
  ru: {
    title: "Продавцы",
    sub: "Рейтинг сотрудников за сегодня",
    loadError: "Не удалось загрузить данные",
    empty: "Сегодня продаж пока нет",
    role: "Роль",
  },
};

export function SellersPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken } = useTenantAuth();
  const { isDark } = useThemeContext();

  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [users, setUsers] = useState<TenantUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [summarySeller, setSummarySeller] = useState<{ userId: string; name: string; roleName?: string } | null>(null);
  const [detailSeller, setDetailSeller] = useState<{ userId: string; name: string } | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    (async () => {
      try {
        const [leaderboardData, usersData] = await Promise.all([
          analyticsApi.getLeaderboard(accessToken),
          usersApi.listUsers(accessToken, USERS_DROPDOWN_LIMIT),
        ]);
        setEntries(leaderboardData);
        setUsers(usersData);
      } catch (err) {
        setError(err instanceof ApiError ? err.detail : t.loadError);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const usersById = new Map(users.map((u) => [u.id, u]));

  // Single series (revenue), ranked by magnitude, not distinct categorical
  // identities -- one hue for all bars (per dataviz skill: sequential = one
  // hue), #1 gets the brand gold-gradient highlight already used elsewhere
  // on this page (avatar circle). Small multiples per currency, same as
  // Course Sales / Dashboard: money is per-currency, never mixed on one axis.
  const byCurrency = useMemo(() => {
    const groups = new Map<string, { name: string; amount: number }[]>();
    for (const e of entries ?? []) {
      const list = groups.get(e.currency) ?? [];
      list.push({ name: e.user_email, amount: e.total_amount });
      groups.set(e.currency, list);
    }
    return [...groups.entries()].map(([currency, rows]) => [currency, rows.slice(0, 8)] as const);
  }, [entries]);

  const axisColor = isDark ? CHART_AXIS_DARK : CHART_AXIS_LIGHT;
  const gridColor = isDark ? CHART_GRID_DARK : CHART_GRID_LIGHT;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <h1 className="font-heading mb-1 text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
        <p className="text-sm text-foreground-muted">{t.sub}</p>
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
          <Trophy size={32} className="text-foreground-muted" />
          <p className="text-sm text-foreground-muted">{t.empty}</p>
        </div>
      )}

      {!error && entries !== null && entries.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-4">
          {byCurrency.map(([currency, rows]) => (
            <div key={currency} className="glass-card p-5">
              <h2 className="mb-4 text-sm font-bold text-foreground">
                {currency} — {t.title}
              </h2>
              <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 40)}>
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
                    width={140}
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
                    formatter={(value) => formatMoney(Number(value), currency)}
                  />
                  <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={24}>
                    {rows.map((row, i) => (
                      <Cell key={row.name} fill={i === 0 ? "#F97316" : "#2563EB"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      )}

      {!error && entries !== null && entries.length > 0 && (
        <div className="glass-card overflow-hidden p-0">
          {entries.map((entry, i) => {
            const roleName = usersById.get(entry.user_id)?.role_name;
            return (
              <button
                key={`${entry.user_id}-${entry.currency}`}
                type="button"
                onClick={() => setSummarySeller({ userId: entry.user_id, name: entry.user_email, roleName })}
                className={`hover:bg-accent/40 flex w-full items-center justify-between gap-3 p-4 text-left transition-colors sm:p-5 ${
                  i < entries.length - 1 ? "border-b border-card-border/60" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                    style={{
                      background: i === 0 ? "linear-gradient(135deg, #FB923C, #F97316)" : "var(--card-border)",
                      color: i === 0 ? "#ffffff" : "var(--foreground-muted)",
                    }}
                  >
                    {i + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{entry.user_email}</div>
                    {roleName && <div className="text-xs text-foreground-muted">{roleName}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-primary">
                      {formatMoney(entry.total_amount, entry.currency)}
                    </div>
                    <div className="text-xs text-foreground-muted">{entry.sales_count}</div>
                  </div>
                  <ChevronRight size={16} className="text-foreground-muted shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {summarySeller && (
        <SellerSummaryDialog
          userId={summarySeller.userId}
          sellerName={summarySeller.name}
          roleName={summarySeller.roleName}
          onClose={() => setSummarySeller(null)}
          onOpenDetails={() => {
            setDetailSeller({ userId: summarySeller.userId, name: summarySeller.name });
            setSummarySeller(null);
          }}
        />
      )}

      <Dialog open={!!detailSeller} onOpenChange={(open) => !open && setDetailSeller(null)}>
        <DialogContent className="max-w-5xl p-5 sm:p-6">
          {detailSeller && <SellerKpiDashboard userId={detailSeller.userId} sellerName={detailSeller.name} />}
        </DialogContent>
      </Dialog>
    </main>
  );
}
