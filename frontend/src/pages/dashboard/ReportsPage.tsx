import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertCircle, AlertTriangle, CheckCircle2, Download, Loader2 } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as reportsApi from "@/lib/api/reports";
import type { Diagnostics, ExportEntity, ExportFormat } from "@/lib/api/reports";
import { ApiError } from "@/lib/api/client";
import { formatMoney } from "@/lib/format/money";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    title: "Hisobotlar",
    sub: "Moliyaviy/operatsion diagnostika va ma'lumot eksporti",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    exportError: "Faylni yuklab bo'lmadi",
    need2fa: "Eksport uchun 2FA yoqilgan bo'lishi kerak.",
    exportTitle: "Ma'lumotlarni eksport qilish",
    noIssues: "Muammo topilmadi",
    salesWithoutCharge: "Charge yozuvi yo'q savdolar",
    staleAdjustments: "Kechikkan tuzatish so'rovlari",
    negativeBalances: "Manfiy balansli savdolar",
    webhookBacklog: "Qayta ishlanmagan webhook'lar",
    outboxBacklog: "Bildirishnoma navbati",
    daysOld: "kun",
  },
  ru: {
    title: "Отчёты",
    sub: "Финансовая/операционная диагностика и экспорт данных",
    loadError: "Не удалось загрузить данные",
    exportError: "Не удалось скачать файл",
    need2fa: "Для экспорта требуется включённая 2FA.",
    exportTitle: "Экспорт данных",
    noIssues: "Проблем не найдено",
    salesWithoutCharge: "Продажи без записи charge",
    staleAdjustments: "Просроченные заявки на корректировку",
    negativeBalances: "Продажи с отрицательным балансом",
    webhookBacklog: "Необработанные вебхуки",
    outboxBacklog: "Очередь уведомлений",
    daysOld: "дн.",
  },
};

const ENTITIES: ExportEntity[] = ["customers", "sales", "finance", "calls"];
const ENTITY_LABELS: Record<ExportEntity, { uz: string; ru: string }> = {
  customers: { uz: "Mijozlar", ru: "Клиенты" },
  sales: { uz: "Savdolar", ru: "Продажи" },
  finance: { uz: "Moliya", ru: "Финансы" },
  calls: { uz: "Qo'ng'iroqlar", ru: "Звонки" },
};

function DiagnosticBlock({
  title,
  count,
  noIssuesLabel,
  children,
}: {
  title: string;
  count: number;
  noIssuesLabel: string;
  children?: ReactNode;
}) {
  return (
    <div className="glass-card p-5">
      <div className="mb-3 flex items-center gap-2">
        {count > 0 ? (
          <AlertTriangle size={16} className="text-primary shrink-0" />
        ) : (
          <CheckCircle2 size={16} className="text-success shrink-0" />
        )}
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        {count > 0 && <span className="text-primary ml-auto font-mono text-xs font-bold">{count}</span>}
      </div>
      {count === 0 ? <p className="text-xs text-foreground-muted">{noIssuesLabel}</p> : children}
    </div>
  );
}

export function ReportsPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken, user } = useTenantAuth();
  const has2fa = Boolean(user?.totp_enabled);
  const canExport = (user?.permissions ?? []).includes("reports.export");

  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    reportsApi
      .getDiagnostics(accessToken)
      .then(setDiagnostics)
      .catch((err) => setError(err instanceof ApiError ? err.detail : t.loadError));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function handleExport(entity: ExportEntity, format: ExportFormat) {
    if (!accessToken) return;
    const key = `${entity}-${format}`;
    setExporting(key);
    try {
      await reportsApi.exportEntity(accessToken, entity, format);
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 403 ? t.need2fa : t.exportError);
    } finally {
      setExporting(null);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <h1 className="font-heading mb-1 text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
        <p className="text-sm text-foreground-muted">{t.sub}</p>
      </div>

      {canExport && (
        <div className="glass-card mb-8 p-5 sm:p-6">
          <h2 className="mb-4 text-sm font-bold text-foreground">{t.exportTitle}</h2>
          {!has2fa && (
            <p className="border-primary/25 bg-primary/8 mb-4 rounded-xl border p-3 text-xs text-foreground">{t.need2fa}</p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ENTITIES.map((entity) => (
              <div key={entity} className="border-card-border flex items-center justify-between rounded-xl border p-3">
                <span className="text-sm text-foreground">{ENTITY_LABELS[entity][lang]}</span>
                <div className="flex gap-2">
                  {(["csv", "xlsx"] as ExportFormat[]).map((format) => (
                    <Button
                      key={format}
                      variant="outline"
                      size="sm"
                      disabled={exporting === `${entity}-${format}`}
                      onClick={() => handleExport(entity, format)}
                    >
                      {exporting === `${entity}-${format}` ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Download size={13} />
                      )}
                      {format.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center">
          <AlertCircle size={28} className="text-destructive" />
          <p className="text-sm text-foreground-muted">{error}</p>
        </div>
      )}

      {!error && diagnostics === null && (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="text-primary animate-spin" />
        </div>
      )}

      {!error && diagnostics !== null && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DiagnosticBlock
            title={t.salesWithoutCharge}
            count={diagnostics.sales_without_charge_entry.length}
            noIssuesLabel={t.noIssues}
          >
            <div className="flex flex-col gap-1.5">
              {diagnostics.sales_without_charge_entry.slice(0, 8).map((s) => (
                <div key={s.sale_id} className="flex items-center justify-between text-xs">
                  <span className="text-foreground-muted">{new Date(s.created_at).toLocaleDateString()}</span>
                  <span className="font-mono text-foreground">{formatMoney(s.price_amount, s.currency)}</span>
                </div>
              ))}
            </div>
          </DiagnosticBlock>

          <DiagnosticBlock
            title={t.staleAdjustments}
            count={diagnostics.stale_pending_adjustment_requests.length}
            noIssuesLabel={t.noIssues}
          >
            <div className="flex flex-col gap-1.5">
              {diagnostics.stale_pending_adjustment_requests.slice(0, 8).map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <span className="text-foreground-muted capitalize">{r.type}</span>
                  <span className="text-primary font-mono">
                    {r.age_days} {t.daysOld}
                  </span>
                </div>
              ))}
            </div>
          </DiagnosticBlock>

          <DiagnosticBlock
            title={t.negativeBalances}
            count={diagnostics.negative_balance_sales.length}
            noIssuesLabel={t.noIssues}
          >
            <div className="flex flex-col gap-1.5">
              {diagnostics.negative_balance_sales.slice(0, 8).map((s) => (
                <div key={s.sale_id} className="flex items-center justify-between text-xs">
                  <span className="text-foreground-muted">{s.sale_id.slice(0, 8)}</span>
                  <span className="text-destructive font-mono">{formatMoney(s.balance, s.currency)}</span>
                </div>
              ))}
            </div>
          </DiagnosticBlock>

          <DiagnosticBlock
            title={t.webhookBacklog}
            count={diagnostics.webhook_events_backlog.reduce((sum, w) => sum + w.unprocessed_count, 0)}
            noIssuesLabel={t.noIssues}
          >
            <div className="flex flex-col gap-1.5">
              {diagnostics.webhook_events_backlog.map((w) => (
                <div key={w.provider} className="flex items-center justify-between text-xs">
                  <span className="text-foreground-muted capitalize">{w.provider}</span>
                  <span className="text-primary font-mono">{w.unprocessed_count}</span>
                </div>
              ))}
            </div>
          </DiagnosticBlock>

          <DiagnosticBlock
            title={t.outboxBacklog}
            count={diagnostics.notification_outbox_backlog.reduce((sum, o) => sum + o.count, 0)}
            noIssuesLabel={t.noIssues}
          >
            <div className="flex flex-col gap-1.5">
              {diagnostics.notification_outbox_backlog.map((o) => (
                <div key={o.status} className="flex items-center justify-between text-xs">
                  <span className="text-foreground-muted capitalize">{o.status}</span>
                  <span className="text-primary font-mono">{o.count}</span>
                </div>
              ))}
            </div>
          </DiagnosticBlock>
        </div>
      )}
    </main>
  );
}
