import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import * as analyticsApi from "@/lib/api/analytics";
import type { LeaderboardEntry } from "@/lib/api/analytics";
import { formatMoney } from "@/lib/format/money";

const content = {
  uz: { title: "Top sotuvchilar", live: "JONLI", empty: "Hali savdolar mavjud emas" },
  ru: { title: "Топ продавцов", live: "ПРЯМОЙ ЭФИР", empty: "Продаж пока нет" },
};

export function LiveLeaderboard({ accessToken }: { accessToken: string }) {
  const { lang } = useLang();
  const t = content[lang];
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [live, setLive] = useState(false);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    analyticsApi.getLeaderboard(accessToken).then(setEntries).catch(() => {});

    const unsubscribe = analyticsApi.subscribeLeaderboard(
      accessToken,
      (next) => {
        setEntries(next);
        setLive(true);
      },
      () => setLive(false),
    );
    return unsubscribe;
  }, [accessToken]);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setPulse((p) => p + 1), 1500);
    return () => clearInterval(timer);
  }, [live]);

  return (
    <div className="glass-card p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Trophy size={18} className="text-primary shrink-0" />
        <h3 className="text-sm font-semibold text-foreground-muted">{t.title}</h3>
        {live && (
          <span className="text-success ml-auto flex items-center gap-1.5 text-[11px] font-bold tracking-wider">
            <span
              className="bg-success size-1.5 rounded-full transition-shadow"
              style={{ boxShadow: `0 0 ${6 + (pulse % 2) * 4}px #2FBF71` }}
            />
            {t.live}
          </span>
        )}
      </div>

      {entries === null && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-accent/60 h-11 animate-pulse rounded-xl" />
          ))}
        </div>
      )}

      {entries !== null && entries.length === 0 && (
        <p className="py-6 text-center text-sm text-foreground-muted">{t.empty}</p>
      )}

      {entries !== null && entries.length > 0 && (
        <div>
          {entries.map((entry, i) => (
            <div
              key={`${entry.user_id}-${entry.currency}`}
              className={`flex items-center justify-between gap-3 py-3 ${
                i < entries.length - 1 ? "border-b border-card-border/60" : ""
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    background: i === 0 ? "linear-gradient(135deg, #E8C874, #B8860B)" : "var(--card-border)",
                    color: i === 0 ? "#0A0E1A" : "var(--foreground-muted)",
                  }}
                >
                  {i + 1}
                </div>
                <span className="truncate text-sm text-foreground">{entry.user_email}</span>
              </div>
              <span className="font-mono shrink-0 text-sm font-semibold text-primary">
                {formatMoney(entry.total_amount, entry.currency)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
