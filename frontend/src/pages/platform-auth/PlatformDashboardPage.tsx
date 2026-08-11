import { useEffect, useState } from "react";
import { Link } from "react-router";
import { AlertTriangle, ArrowUpRight, Building2, CreditCard, Cpu, HardDrive, MemoryStick, Users } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { usePlatformAuth } from "@/lib/auth/platformAuthStore";
import * as platformDashboardApi from "@/lib/api/platformDashboard";
import type { DashboardSummary, ServerMetrics, TenantStorageUsage } from "@/lib/api/platformDashboard";
import { formatBytes } from "@/lib/format/storage";
import * as platformTenantsApi from "@/lib/api/platformTenants";
import type { Tenant } from "@/lib/api/platformTenants";
import * as platformBackupApi from "@/lib/api/platformBackup";
import type { BackupSettingsStatus } from "@/lib/api/platformBackup";
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
    monthlyRevenue: "Oylik tushum",
    newPayments: "Yangi to'lovlar",
    recurringPayments: "Doimiy to'lovlar",
    peopleCount: (n: number) => `${n} kishi`,
    tenantsTitle: "Tenantlar",
    name: "Nomi",
    slug: "Slug",
    status: "Holat",
    trialEndsAt: "Sinov tugaydi",
    storage: "Xotira",
    serverTitle: "Server holati",
    cpu: "CPU",
    memory: "Xotira (RAM)",
    disk: "Disk",
    plansTitle: "Tariflar",
    viewAllPlans: "Barchasini ko'rish",
    tenantsSuffix: "tenant",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    backupNotConfigured: "Ma'lumotlar bazasi zaxira nusxasi sozlanmagan — server nobud bo'lsa, ma'lumot yo'qolishi mumkin.",
    backupFailed: "Oxirgi zaxira nusxa muvaffaqiyatsiz tugadi.",
    backupSetup: "Sozlash",
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
    monthlyRevenue: "Выручка за месяц",
    newPayments: "Новые платежи",
    recurringPayments: "Повторные платежи",
    peopleCount: (n: number) => `${n} чел.`,
    tenantsTitle: "Тенанты",
    name: "Название",
    slug: "Slug",
    status: "Статус",
    trialEndsAt: "Пробный период до",
    storage: "Хранилище",
    serverTitle: "Состояние сервера",
    cpu: "CPU",
    memory: "Память (RAM)",
    disk: "Диск",
    plansTitle: "Тарифы",
    viewAllPlans: "Смотреть все",
    tenantsSuffix: "тенантов",
    loadError: "Не удалось загрузить данные",
    backupNotConfigured: "Резервное копирование базы данных не настроено — при потере сервера данные могут быть утеряны.",
    backupFailed: "Последняя резервная копия завершилась с ошибкой.",
    backupSetup: "Настроить",
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
  const [storageUsage, setStorageUsage] = useState<TenantStorageUsage[] | null>(null);
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupSettingsStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([platformDashboardApi.getSummary(accessToken), platformTenantsApi.listTenants(accessToken)])
      .then(([summaryData, tenantsData]) => {
        setSummary(summaryData);
        setTenants(tenantsData);
      })
      .catch(() => setError(t.loadError));
    // Fetched separately (not folded into the Promise.all above) so a
    // backup-status failure never blocks the rest of the dashboard from
    // rendering -- the warning banner just silently stays absent.
    platformBackupApi.getBackupSettings(accessToken).then(setBackupStatus).catch(() => {});
    // Also fetched separately -- a storage-usage failure shouldn't block the
    // rest of the dashboard, the column just falls back to "—" per row.
    platformDashboardApi.getStorageUsage(accessToken).then(setStorageUsage).catch(() => {});
  }, [accessToken, t.loadError]);

  useEffect(() => {
    if (!accessToken) return;
    const unsubscribe = platformDashboardApi.subscribeServerMetrics(accessToken, setMetrics);
    return unsubscribe;
  }, [accessToken]);

  const activeCount = summary?.tenants_by_status.find((s) => s.status === "active")?.count ?? 0;
  const trialCount = summary?.tenants_by_status.find((s) => s.status === "trial")?.count ?? 0;

  const newPayments = summary?.payments_this_month_by_kind.filter((p) => p.kind === "new") ?? [];
  const recurringPayments = summary?.payments_this_month_by_kind.filter((p) => p.kind === "recurring") ?? [];
  const revenueByCurrency = new Map<string, number>();
  for (const p of summary?.payments_this_month_by_kind ?? []) {
    revenueByCurrency.set(p.currency, (revenueByCurrency.get(p.currency) ?? 0) + p.total_amount);
  }
  const totalNewPeople = newPayments.reduce((sum, p) => sum + p.count, 0);
  const totalRecurringPeople = recurringPayments.reduce((sum, p) => sum + p.count, 0);

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="font-heading mb-1 text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
        <p className="text-sm text-foreground-muted">{t.sub}</p>
      </div>

      {error && <div className="glass-card p-6 text-center text-sm text-foreground-muted">{error}</div>}

      {backupStatus && (!backupStatus.configured || backupStatus.last_backup_status === "failed") && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="shrink-0 text-amber-500" />
            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
              {backupStatus.configured ? t.backupFailed : t.backupNotConfigured}
            </p>
          </div>
          <Link
            to="/platform/backup-settings"
            className="shrink-0 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-600 whitespace-nowrap hover:bg-amber-500/10 dark:text-amber-400"
          >
            {t.backupSetup}
          </Link>
        </div>
      )}

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

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard
              icon={CreditCard}
              iconColor="#059669"
              label={t.monthlyRevenue}
              value={
                revenueByCurrency.size > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    {[...revenueByCurrency.entries()].map(([currency, amount]) => (
                      <span key={currency} className="font-mono text-lg font-bold text-foreground">
                        {formatMoney(amount, currency)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-foreground-muted">—</span>
                )
              }
            />
            <KpiCard
              icon={Users}
              iconColor="#2563EB"
              label={t.newPayments}
              value={
                newPayments.length > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-foreground-muted text-xs">{t.peopleCount(totalNewPeople)}</span>
                    {newPayments.map((p) => (
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
            <KpiCard
              icon={Users}
              iconColor="#F59E0B"
              label={t.recurringPayments}
              value={
                recurringPayments.length > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-foreground-muted text-xs">{t.peopleCount(totalRecurringPeople)}</span>
                    {recurringPayments.map((p) => (
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
                        <th className="px-2 py-2 text-left font-medium">{t.storage}</th>
                        <th className="px-2 py-2 text-right font-medium">{t.trialEndsAt}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenants.map((tenant) => {
                        const color = STATUS_COLOR[tenant.status] ?? "#6B7280";
                        const usage = storageUsage?.find((u) => u.tenant_id === tenant.id);
                        const usagePercent = usage ? usage.usage_ratio_bps / 100 : 0;
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
                            <td className="px-2 py-2.5">
                              {usage && usage.billable_storage_limit_bytes !== null ? (
                                <div className="w-28">
                                  <div className="text-foreground-muted mb-1 font-mono text-[11px] whitespace-nowrap">
                                    {formatBytes(usage.total_bytes)} / {formatBytes(usage.billable_storage_limit_bytes)}
                                  </div>
                                  <div className="bg-accent h-1.5 w-full overflow-hidden rounded-full">
                                    <div
                                      className="h-full rounded-full transition-all"
                                      style={{ width: `${Math.min(100, usagePercent)}%`, background: metricColor(usagePercent) }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-foreground-muted text-xs">—</span>
                              )}
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

          <div className="glass-card p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CreditCard size={15} className="text-foreground-muted" />
                {t.plansTitle}
              </h3>
              <Link
                to="/platform/billing-plans"
                className="text-primary flex items-center gap-1 text-xs font-semibold hover:underline"
              >
                {t.viewAllPlans}
                <ArrowUpRight size={13} />
              </Link>
            </div>

            {!summary ? (
              <div className="bg-accent/60 h-20 animate-pulse rounded-xl" />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {summary.plans_usage.map((plan) => {
                  const maxCount = Math.max(1, ...summary.plans_usage.map((p) => p.tenant_count));
                  const width = (plan.tenant_count / maxCount) * 100;
                  return (
                    <Link
                      key={plan.code}
                      to="/platform/billing-plans"
                      className="border-card-border/60 hover:border-primary/40 block rounded-xl border p-3 transition-colors"
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-foreground">{plan.name}</span>
                        <span className="font-mono text-xs text-foreground-muted">
                          {plan.tenant_count} {t.tenantsSuffix}
                        </span>
                      </div>
                      <div className="bg-accent h-1.5 w-full overflow-hidden rounded-full">
                        <div className="gold-gradient-bg h-full rounded-full transition-all" style={{ width: `${width}%` }} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
