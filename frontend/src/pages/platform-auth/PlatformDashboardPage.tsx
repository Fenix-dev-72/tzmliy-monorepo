import { useEffect, useState } from "react";
import { Building2, Cpu, HardDrive, MemoryStick, Users } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { usePlatformAuth } from "@/lib/auth/platformAuthStore";
import * as platformDashboardApi from "@/lib/api/platformDashboard";
import type { DashboardSummary, ServerMetrics } from "@/lib/api/platformDashboard";
import * as platformTenantsApi from "@/lib/api/platformTenants";
import type { Tenant } from "@/lib/api/platformTenants";
import { formatMoney } from "@/lib/format/money";
import { KpiCard } from "@/pages/dashboard/home/KpiCard";

const content = {
  uz: {
    title: "Boshqaruv paneli",
    sub: "Platformaning umumiy holati",
    totalTenants: "Jami tenantlar",
    activeTenants: "Faol",
    trialTenants: "Sinov muddatida",
    paymentsToday: "Bugungi to'lovlar",
    tenantsTitle: "Tenantlar",
    name: "Nomi",
    slug: "Slug",
    status: "Holat",
    trialEndsAt: "Sinov tugaydi",
    serverTitle: "Server holati",
    cpu: "CPU",
    memory: "Xotira (RAM)",
    disk: "Disk",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    statuses: {
      trial: "Sinov",
      active: "Faol",
      past_due: "Muddati o'tgan",
      grace: "Imtiyoz muddati",
      suspended: "To'xtatilgan",
      cancelled: "Bekor qilingan",
    } as Record<string, string>,
  },
  ru: {
    title: "Панель управления",
    sub: "Общее состояние платформы",
    totalTenants: "Всего тенантов",
    activeTenants: "Активные",
    trialTenants: "На пробном периоде",
    paymentsToday: "Платежи сегодня",
    tenantsTitle: "Тенанты",
    name: "Название",
    slug: "Slug",
    status: "Статус",
    trialEndsAt: "Пробный период до",
    serverTitle: "Состояние сервера",
    cpu: "CPU",
    memory: "Память (RAM)",
    disk: "Диск",
    loadError: "Не удалось загрузить данные",
    statuses: {
      trial: "Пробный",
      active: "Активен",
      past_due: "Просрочен",
      grace: "Льготный период",
      suspended: "Приостановлен",
      cancelled: "Отменён",
    } as Record<string, string>,
  },
};

const STATUS_COLOR: Record<string, string> = {
  trial: "#F59E0B",
  active: "#10B981",
  past_due: "#F97316",
  grace: "#F97316",
  suspended: "#EF4444",
  cancelled: "#6B7280",
};

function metricColor(percent: number): string {
  if (percent >= 90) return "#EF4444";
  if (percent >= 70) return "#F59E0B";
  return "#10B981";
}

function bytesToGb(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1);
}

function MetricBar({ label, icon: Icon, percent, detail }: { label: string; icon: typeof Cpu; percent: number; detail: string }) {
  const color = metricColor(percent);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <Icon size={15} className="text-foreground-muted" />
          {label}
        </span>
        <span className="font-mono text-xs text-foreground-muted">{detail}</span>
      </div>
      <div className="bg-accent h-2 w-full overflow-hidden rounded-full">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, percent)}%`, background: color }} />
      </div>
    </div>
  );
}

export function PlatformDashboardPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken } = usePlatformAuth();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([platformDashboardApi.getSummary(accessToken), platformTenantsApi.listTenants(accessToken)])
      .then(([summaryData, tenantsData]) => {
        setSummary(summaryData);
        setTenants(tenantsData);
      })
      .catch(() => setError(t.loadError));
  }, [accessToken, t.loadError]);

  useEffect(() => {
    if (!accessToken) return;
    const unsubscribe = platformDashboardApi.subscribeServerMetrics(accessToken, setMetrics);
    return unsubscribe;
  }, [accessToken]);

  const activeCount = summary?.tenants_by_status.find((s) => s.status === "active")?.count ?? 0;
  const trialCount = summary?.tenants_by_status.find((s) => s.status === "trial")?.count ?? 0;

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="font-heading mb-1 text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
        <p className="text-sm text-foreground-muted">{t.sub}</p>
      </div>

      {error && <div className="glass-card p-6 text-center text-sm text-foreground-muted">{error}</div>}

      {!error && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={Building2}
              iconColor="#2563EB"
              label={t.totalTenants}
              value={<span className="font-mono text-2xl font-bold text-foreground">{summary?.total_tenants ?? "—"}</span>}
            />
            <KpiCard
              icon={Users}
              iconColor="#10B981"
              label={t.activeTenants}
              value={<span className="font-mono text-2xl font-bold text-foreground">{activeCount}</span>}
            />
            <KpiCard
              icon={Users}
              iconColor="#F59E0B"
              label={t.trialTenants}
              value={<span className="font-mono text-2xl font-bold text-foreground">{trialCount}</span>}
            />
            <KpiCard
              icon={Building2}
              iconColor="#9333EA"
              label={t.paymentsToday}
              value={
                summary && summary.payments_today.length > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    {summary.payments_today
                      .filter((p) => p.status === "paid")
                      .map((p) => (
                        <span key={p.currency} className="font-mono text-lg font-bold text-foreground">
                          {formatMoney(p.total_amount, p.currency)}
                        </span>
                      ))}
                  </div>
                ) : (
                  <span className="text-sm text-foreground-muted">—</span>
                )
              }
            />
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="glass-card p-5 sm:p-6 xl:col-span-2">
              <h3 className="mb-4 text-sm font-semibold text-foreground">{t.tenantsTitle}</h3>
              {tenants === null ? (
                <div className="bg-accent/60 h-32 animate-pulse rounded-xl" />
              ) : (
                <div className="-mx-2 overflow-x-auto">
                  <table className="w-full min-w-[480px] border-collapse text-sm">
                    <thead>
                      <tr className="text-foreground-muted border-card-border/60 border-b text-xs">
                        <th className="px-2 py-2 text-left font-medium">{t.name}</th>
                        <th className="px-2 py-2 text-left font-medium">{t.slug}</th>
                        <th className="px-2 py-2 text-left font-medium">{t.status}</th>
                        <th className="px-2 py-2 text-right font-medium">{t.trialEndsAt}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenants.map((tenant) => {
                        const color = STATUS_COLOR[tenant.status] ?? "#6B7280";
                        return (
                          <tr key={tenant.id} className="border-card-border/60 border-b last:border-0">
                            <td className="px-2 py-2.5 font-medium text-foreground">{tenant.name}</td>
                            <td className="text-foreground-muted px-2 py-2.5 font-mono text-xs">{tenant.slug}</td>
                            <td className="px-2 py-2.5">
                              <span
                                className="rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
                                style={{ background: `${color}15`, borderColor: `${color}30`, color }}
                              >
                                {t.statuses[tenant.status] ?? tenant.status}
                              </span>
                            </td>
                            <td className="text-foreground-muted px-2 py-2.5 text-right text-xs">
                              {tenant.trial_ends_at ? new Date(tenant.trial_ends_at).toLocaleDateString() : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="glass-card space-y-4 p-5 sm:p-6">
              <h3 className="text-sm font-semibold text-foreground">{t.serverTitle}</h3>
              {metrics === null ? (
                <div className="bg-accent/60 h-32 animate-pulse rounded-xl" />
              ) : (
                <>
                  <MetricBar label={t.cpu} icon={Cpu} percent={metrics.cpu_percent} detail={`${metrics.cpu_percent.toFixed(0)}%`} />
                  <MetricBar
                    label={t.memory}
                    icon={MemoryStick}
                    percent={metrics.memory_percent}
                    detail={`${bytesToGb(metrics.memory_used_bytes)} / ${bytesToGb(metrics.memory_total_bytes)} GB`}
                  />
                  <MetricBar
                    label={t.disk}
                    icon={HardDrive}
                    percent={metrics.disk_percent}
                    detail={`${bytesToGb(metrics.disk_used_bytes)} / ${bytesToGb(metrics.disk_total_bytes)} GB`}
                  />
                </>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
