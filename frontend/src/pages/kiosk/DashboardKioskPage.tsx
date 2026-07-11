import { useEffect, useState } from "react";
import { AlertCircle, Loader2, LogOut, Trophy } from "lucide-react";
import * as dashboardSessionApi from "@/lib/api/dashboardSession";
import { ApiError } from "@/lib/api/client";
import { decodeJwtPayload } from "@/lib/auth/jwt";
import { formatMoney } from "@/lib/format/money";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { TzmliyLogo, TzmliyWordmark } from "@/components/layout/TzmliyLogo";
import type { LeaderboardEntry } from "@/lib/api/analytics";

const STORAGE_KEY = "tzmliy_dashboard_session";

const content = {
  title: "Kiosk ekran",
  sub: "TV/kiosk uchun jonli reyting ekrani",
  tenantSlug: "Kompaniya slug",
  name: "Ekran nomi",
  password: "Parol",
  login: "Kirish",
  invalidCredentials: "Login ma'lumotlari noto'g'ri",
  genericError: "Xatolik yuz berdi",
  logout: "Chiqish",
  live: "JONLI",
  empty: "Hali savdolar mavjud emas",
  loading: "Yuklanmoqda...",
};

function readStoredToken(): string | null {
  const token = localStorage.getItem(STORAGE_KEY);
  if (!token) return null;
  const claims = decodeJwtPayload(token);
  const exp = typeof claims.exp === "number" ? claims.exp : 0;
  if (exp * 1000 < Date.now()) {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
  return token;
}

function KioskLogin({ onSuccess }: { onSuccess: (token: string) => void }) {
  const [tenantSlug, setTenantSlug] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardSessionApi.dashboardLogin({
        tenant_slug: tenantSlug.trim(),
        name: name.trim(),
        password,
      });
      localStorage.setItem(STORAGE_KEY, res.access_token);
      onSuccess(res.access_token);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? content.invalidCredentials : content.genericError);
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = tenantSlug.trim().length > 0 && name.trim().length > 0 && password.length > 0;

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <div className="glass-card auth-card-enter w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center gap-2">
          <TzmliyLogo size={32} />
          <TzmliyWordmark className="text-lg" />
        </div>
        <h1 className="font-heading mb-1 text-center text-lg font-bold text-foreground">{content.title}</h1>
        <p className="mb-6 text-center text-sm text-foreground-muted">{content.sub}</p>

        <FormField label={content.tenantSlug} value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} placeholder="acme-llc" />
        <FormField label={content.name} value={name} onChange={(e) => setName(e.target.value)} />
        <FormField label={content.password} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

        {error && <p className="text-destructive mb-4 text-[13px] font-medium">{error}</p>}

        <Button variant="gold" className="w-full" disabled={!canSubmit || loading} onClick={handleSubmit}>
          {loading && <Loader2 size={16} className="animate-spin" />}
          {content.login}
        </Button>
      </div>
    </div>
  );
}

function KioskBoard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [live, setLive] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    dashboardSessionApi
      .getLeaderboard(token)
      .then(setEntries)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) setSessionExpired(true);
      });

    const unsubscribe = dashboardSessionApi.subscribeLeaderboard(
      token,
      (next) => {
        setEntries(next);
        setLive(true);
      },
      () => setLive(false),
    );
    return unsubscribe;
  }, [token]);

  useEffect(() => {
    if (sessionExpired) {
      localStorage.removeItem(STORAGE_KEY);
      onLogout();
    }
  }, [sessionExpired, onLogout]);

  return (
    <div className="bg-background min-h-screen p-6 sm:p-10">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TzmliyLogo size={30} />
          <TzmliyWordmark className="text-xl" />
        </div>
        <div className="flex items-center gap-4">
          {live && (
            <span className="text-success flex items-center gap-1.5 text-xs font-bold tracking-wider">
              <span className="bg-success size-2 animate-pulse rounded-full" />
              {content.live}
            </span>
          )}
          <button
            onClick={() => {
              localStorage.removeItem(STORAGE_KEY);
              onLogout();
            }}
            className="text-foreground-muted flex items-center gap-1.5 text-xs"
          >
            <LogOut size={14} />
            {content.logout}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <Trophy size={28} className="text-primary" />
          <h1 className="font-heading text-2xl font-extrabold text-foreground sm:text-3xl">Top sotuvchilar</h1>
        </div>

        {entries === null && (
          <div className="flex justify-center py-24">
            <Loader2 size={32} className="text-primary animate-spin" />
          </div>
        )}

        {entries !== null && entries.length === 0 && (
          <div className="glass-card flex flex-col items-center gap-3 p-16 text-center">
            <AlertCircle size={32} className="text-foreground-muted" />
            <p className="text-foreground-muted">{content.empty}</p>
          </div>
        )}

        {entries !== null && entries.length > 0 && (
          <div className="glass-card overflow-hidden p-0">
            {entries.map((entry, i) => (
              <div
                key={`${entry.user_id}-${entry.currency}`}
                className={`flex items-center justify-between gap-4 p-5 sm:p-6 ${
                  i < entries.length - 1 ? "border-b border-card-border/60" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div
                    className="flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-bold"
                    style={{
                      background: i === 0 ? "linear-gradient(135deg, #E8C874, #B8860B)" : "var(--card-border)",
                      color: i === 0 ? "#0A0E1A" : "var(--foreground-muted)",
                    }}
                  >
                    {i + 1}
                  </div>
                  <span className="truncate text-lg font-semibold text-foreground">{entry.user_email}</span>
                </div>
                <span className="font-mono shrink-0 text-xl font-bold text-primary">
                  {formatMoney(entry.total_amount, entry.currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function DashboardKioskPage() {
  const [token, setToken] = useState<string | null>(() => readStoredToken());

  if (!token) return <KioskLogin onSuccess={setToken} />;
  return <KioskBoard token={token} onLogout={() => setToken(null)} />;
}
