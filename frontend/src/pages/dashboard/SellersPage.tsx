import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Trophy } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as usersApi from "@/lib/api/users";
import type { TenantUserRow } from "@/lib/api/users";
import * as analyticsApi from "@/lib/api/analytics";
import type { LeaderboardEntry } from "@/lib/api/analytics";
import { ApiError } from "@/lib/api/client";
import { formatMoney } from "@/lib/format/money";

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

  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [users, setUsers] = useState<TenantUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    (async () => {
      try {
        const [leaderboardData, usersData] = await Promise.all([
          analyticsApi.getLeaderboard(accessToken),
          usersApi.listUsers(accessToken),
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
        <div className="glass-card overflow-hidden p-0">
          {entries.map((entry, i) => {
            const roleName = usersById.get(entry.user_id)?.role_name;
            return (
              <div
                key={`${entry.user_id}-${entry.currency}`}
                className={`flex items-center justify-between gap-3 p-4 sm:p-5 ${
                  i < entries.length - 1 ? "border-b border-card-border/60" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                    style={{
                      background: i === 0 ? "linear-gradient(135deg, #E8C874, #B8860B)" : "var(--card-border)",
                      color: i === 0 ? "#0A0E1A" : "var(--foreground-muted)",
                    }}
                  >
                    {i + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{entry.user_email}</div>
                    {roleName && <div className="text-xs text-foreground-muted">{roleName}</div>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm font-bold text-primary">
                    {formatMoney(entry.total_amount, entry.currency)}
                  </div>
                  <div className="text-xs text-foreground-muted">{entry.sales_count}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
