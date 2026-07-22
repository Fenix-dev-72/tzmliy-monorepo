import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Trophy } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as analyticsApi from "@/lib/api/analytics";
import type { SellerKpis } from "@/lib/api/analytics";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/format/money";

const content = {
  uz: {
    agent: "AGENT",
    details: "Batafsil",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    sales: "Sotuvlar",
    calls: "Qo'ng'iroqlar",
    avgSale: "O'rtacha sotuv",
    conversion: "Konversiya",
    leadToSale: "Lid -> Sotuv",
    followup: "Follow-up",
    followupNotLinked: "CRM ulanmagan",
    outbound: "Chiquvchi",
    missed: "O'tkazib yub.",
    debtCollection: "Qarz yig'ish",
    refunds: "Qaytarish",
    responseTime: "Javob vaqti",
  },
  ru: {
    agent: "АГЕНТ",
    details: "Подробнее",
    loadError: "Не удалось загрузить данные",
    sales: "Продажи",
    calls: "Звонки",
    avgSale: "Средняя продажа",
    conversion: "Конверсия",
    leadToSale: "Лид -> Продажа",
    followup: "Follow-up",
    followupNotLinked: "CRM не подключен",
    outbound: "Исходящие",
    missed: "Пропущено",
    debtCollection: "Сбор долгов",
    refunds: "Возвраты",
    responseTime: "Время ответа",
  },
};

function formatSeconds(seconds: number | null, lang: "uz" | "ru"): string {
  if (seconds === null) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const unit = lang === "ru" ? { h: "ч", m: "мин" } : { h: "soat", m: "daq" };
  return hours > 0 ? `${hours} ${unit.h} ${minutes} ${unit.m}` : `${minutes} ${unit.m}`;
}

function HeadlineTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-card-border bg-background/60 rounded-2xl border p-4 text-center">
      <div className="text-foreground-muted mb-1 text-xs">{label}</div>
      <div className="text-xl font-extrabold text-foreground">{value}</div>
      {hint && <div className="text-foreground-muted mt-1 text-xs">{hint}</div>}
    </div>
  );
}

function Pill({ label, value, tone }: { label: string; value: string; tone: "danger" | "success" | "warning" | "neutral" }) {
  const toneClass =
    tone === "danger"
      ? "border-destructive/25 bg-destructive/8 text-destructive"
      : tone === "success"
        ? "border-success/25 bg-success/8 text-success"
        : tone === "warning"
          ? "border-primary/25 bg-primary/8 text-primary"
          : "border-card-border bg-background/60 text-foreground";
  return (
    <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${toneClass}`}>
      <span className="text-sm">{label}</span>
      <span className="font-mono text-sm font-bold">{value}</span>
    </div>
  );
}

export function SellerSummaryDialog({
  userId,
  sellerName,
  roleName,
  onClose,
  onOpenDetails,
}: {
  userId: string;
  sellerName: string;
  roleName?: string;
  onClose: () => void;
  onOpenDetails: () => void;
}) {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken } = useTenantAuth();

  const [kpis, setKpis] = useState<SellerKpis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    setKpis(null);
    setError(null);
    const now = new Date();
    const start = new Date(now);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    analyticsApi
      .getSellerKpis(accessToken, userId, start.toISOString(), now.toISOString())
      .then(setKpis)
      .catch((err) => setError(err instanceof ApiError ? err.detail : t.loadError));
  }, [accessToken, userId, t.loadError]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-foreground-muted flex items-center gap-1.5 text-xs font-bold tracking-wider">
              <Trophy size={12} /> {t.agent}
            </div>
            <h2 className="font-heading text-xl font-extrabold text-foreground">{sellerName}</h2>
            {roleName && <p className="text-foreground-muted text-xs">{roleName}</p>}
          </div>
          <Button variant="gold" size="sm" onClick={onOpenDetails}>
            {t.details}
          </Button>
        </div>

        {error && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <AlertCircle size={24} className="text-destructive" />
            <p className="text-sm text-foreground-muted">{error}</p>
          </div>
        )}

        {!error && kpis === null && (
          <div className="flex justify-center py-10">
            <Loader2 size={22} className="text-primary animate-spin" />
          </div>
        )}

        {!error && kpis && (
          <>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <HeadlineTile label={t.sales} value={String(kpis.sales_count)} hint={formatMoney(kpis.sales_total_uzs, "UZS")} />
              <HeadlineTile label={t.calls} value={String(kpis.calls_total)} />
              <HeadlineTile
                label={t.avgSale}
                value={kpis.sales_count ? formatMoney(Math.round(kpis.sales_total_uzs / kpis.sales_count), "UZS") : "—"}
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Pill label={t.conversion} value={kpis.conversion_pct === null ? "—" : `${kpis.conversion_pct}%`} tone="danger" />
              <Pill label={t.leadToSale} value={`${kpis.leads_count} -> ${kpis.sales_count}`} tone="success" />
              <Pill
                label={t.followup}
                value={!kpis.followup_linked ? t.followupNotLinked : kpis.followup_pct === null ? "—" : `${kpis.followup_pct}%`}
                tone={kpis.followup_linked && kpis.followup_pct !== null ? "success" : "neutral"}
              />
              <Pill
                label={t.outbound}
                value={kpis.calls_total ? `${Math.round((kpis.calls_outbound / kpis.calls_total) * 100)}%` : "—"}
                tone="success"
              />
              <Pill
                label={t.missed}
                value={kpis.calls_missed_pct === null ? "—" : `${kpis.calls_missed_pct}%`}
                tone={kpis.calls_missed_pct !== null && kpis.calls_missed_pct > 20 ? "danger" : "success"}
              />
              <Pill
                label={t.debtCollection}
                value={kpis.debt_collection_pct === null ? "—" : `${kpis.debt_collection_pct}%`}
                tone="warning"
              />
              <Pill
                label={t.refunds}
                value={kpis.refund_pct === null ? "—" : `${kpis.refund_pct}%`}
                tone={kpis.refund_pct !== null && kpis.refund_pct > 10 ? "danger" : "success"}
              />
              <Pill label={t.responseTime} value={formatSeconds(kpis.lead_response_median_seconds, lang)} tone="neutral" />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
