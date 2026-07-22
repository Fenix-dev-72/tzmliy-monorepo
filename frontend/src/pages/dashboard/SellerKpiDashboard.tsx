import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as analyticsApi from "@/lib/api/analytics";
import type { SellerKpis } from "@/lib/api/analytics";
import * as usersApi from "@/lib/api/users";
import { USERS_DROPDOWN_LIMIT } from "@/lib/api/users";
import * as notificationsApi from "@/lib/api/notifications";
import { ApiError } from "@/lib/api/client";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format/money";

const content = {
  uz: {
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    periodToday: "Bugun",
    periodWeek: "Hafta",
    periodMonth: "Oy",
    period30: "30 kun",
    periodCustom: "Maxsus",
    from: "Dan",
    to: "Gacha",
    leads: "Lidlar",
    sales: "Savdolar",
    conversion: "Konversiya",
    debtCollection: "Qarz yig'ish darajasi",
    refunds: "Qaytarish darajasi",
    followup: "Follow-up bajarish",
    followupNotLinked: "CRM ulanmagan",
    followupUnavailable: "Ma'lumot olinmadi",
    followupTasks: "vazifa",
    noData: "Bu davrda ma'lumot yo'q",
    sendPdf: "PDF ni adminlarga yuborish",
    sendPdfSending: "Yuborilmoqda...",
    sendPdfSuccess: "PDF navbatga qo'yildi",
    sendPdfError: "Yuborib bo'lmadi",
    sectionKpi: "ASOSIY KO'RSATKICHLAR (KPI)",
    sectionSales: "SOTUV KO'RSATKICHLARI",
    sectionCalls: "QO'NG'IROQLAR VA FAOLLIK",
    sectionCrm: "CRM FAOLIYAT",
    sectionLeads: "LID KO'RSATKICHLARI",
    sectionFinance: "MOLIYAVIY KO'RSATKICHLAR",
    avgSale: "O'rtacha sotuv",
    dailyTalkTime: "Kunlik suhbat vaqti",
    leadResponseTime: "Lid javob vaqti",
    salesContracts: "Sotuv shartnomasi",
    agreed: "Kelishuv",
    collected: "Tushum",
    modeUnset: "Aniqlanmagan",
    modeOnline: "Onlayn",
    modeOffline: "Oflayn",
    modeIntensive: "Intensiv",
    totalCalls: "Jami qo'ng'iroqlar",
    outboundCalls: "Chiquvchi qo'ng'iroqlar",
    inboundCalls: "Kiruvchi qo'ng'iroqlar",
    missedCalls: "O'tkazib yuborilgan",
    avgDuration: "O'rtacha davomiylik",
    crmNotes: "Yozuvlar",
    crmStageChanges: "Bosqich o'zgarishi",
    activeLeads: "Faol lidlar",
    newLeads: "Yangi lidlar",
    wonLeads: "Yutilgan lidlar",
    lostLeads: "Yo'qotilgan lidlar",
    qualityLeads: "Sifatli lidlar",
    lowQualityLeads: "Sifatsiz lidlar",
  },
  ru: {
    loadError: "Не удалось загрузить данные",
    periodToday: "Сегодня",
    periodWeek: "Неделя",
    periodMonth: "Месяц",
    period30: "30 дней",
    periodCustom: "Свой период",
    from: "С",
    to: "По",
    leads: "Лиды",
    sales: "Продажи",
    conversion: "Конверсия",
    debtCollection: "Уровень сбора долгов",
    refunds: "Уровень возвратов",
    followup: "Выполнение follow-up",
    followupNotLinked: "CRM не подключен",
    followupUnavailable: "Данные недоступны",
    followupTasks: "задач",
    noData: "За этот период данных нет",
    sendPdf: "Отправить PDF админам",
    sendPdfSending: "Отправка...",
    sendPdfSuccess: "PDF поставлен в очередь",
    sendPdfError: "Не удалось отправить",
    sectionKpi: "ОСНОВНЫЕ ПОКАЗАТЕЛИ (KPI)",
    sectionSales: "ПОКАЗАТЕЛИ ПРОДАЖ",
    sectionCalls: "ЗВОНКИ И АКТИВНОСТЬ",
    sectionCrm: "АКТИВНОСТЬ CRM",
    sectionLeads: "ПОКАЗАТЕЛИ ЛИДОВ",
    sectionFinance: "ФИНАНСОВЫЕ ПОКАЗАТЕЛИ",
    avgSale: "Средняя продажа",
    dailyTalkTime: "Дневное время разговора",
    leadResponseTime: "Время ответа лиду",
    salesContracts: "Договоров продаж",
    agreed: "Согласовано",
    collected: "Собрано",
    modeUnset: "Не указано",
    modeOnline: "Онлайн",
    modeOffline: "Оффлайн",
    modeIntensive: "Интенсив",
    totalCalls: "Всего звонков",
    outboundCalls: "Исходящие звонки",
    inboundCalls: "Входящие звонки",
    missedCalls: "Пропущенные",
    avgDuration: "Средняя длительность",
    crmNotes: "Записи",
    crmStageChanges: "Смена этапа",
    activeLeads: "Активные лиды",
    newLeads: "Новые лиды",
    wonLeads: "Выигранные лиды",
    lostLeads: "Потерянные лиды",
    qualityLeads: "Качественные лиды",
    lowQualityLeads: "Некачественные лиды",
  },
};

type PeriodPreset = "today" | "week" | "month" | "30d" | "custom";

function computeRange(preset: PeriodPreset, customFrom: string, customTo: string): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString();
  if (preset === "custom") {
    return {
      start: customFrom ? new Date(customFrom).toISOString() : end,
      end: customTo ? new Date(customTo + "T23:59:59").toISOString() : end,
    };
  }
  const start = new Date(now);
  if (preset === "today") start.setHours(0, 0, 0, 0);
  else if (preset === "week") start.setDate(now.getDate() - 7);
  else if (preset === "30d") start.setDate(now.getDate() - 30);
  else if (preset === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }
  return { start: start.toISOString(), end };
}

function formatSeconds(seconds: number | null, lang: "uz" | "ru"): string {
  if (seconds === null) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const unit = lang === "ru" ? { h: "ч", m: "мин" } : { h: "soat", m: "daq" };
  return hours > 0 ? `${hours} ${unit.h} ${minutes} ${unit.m}` : `${minutes} ${unit.m}`;
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" | "success" | "warning" }) {
  const toneClass =
    tone === "danger"
      ? "border-destructive/25 bg-destructive/8 text-destructive"
      : tone === "success"
        ? "border-success/25 bg-success/8 text-success"
        : tone === "warning"
          ? "border-primary/25 bg-primary/8 text-primary"
          : "border-card-border bg-background/60 text-foreground";
  return (
    <div className={`rounded-2xl border p-5 ${toneClass}`}>
      <div className="mb-1 text-xs opacity-80">{label}</div>
      <div className="text-2xl font-extrabold">{value}</div>
      {hint && <div className="mt-1 text-xs opacity-70">{hint}</div>}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-foreground-muted mt-8 mb-3 text-xs font-bold tracking-wider first:mt-0">{children}</h3>;
}

const MODE_KEY = { online: "modeOnline", offline: "modeOffline", intensive: "modeIntensive" } as const;

export function SellerKpiDashboard({ userId, sellerName: sellerNameProp }: { userId: string; sellerName?: string }) {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken } = useTenantAuth();

  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [kpis, setKpis] = useState<SellerKpis | null>(null);
  const [sellerName, setSellerName] = useState<string | null>(sellerNameProp ?? null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (sellerNameProp || !accessToken || !userId) return;
    usersApi
      .listUsers(accessToken, USERS_DROPDOWN_LIMIT)
      .then((users) => {
        const u = users.find((x) => x.id === userId);
        if (u) setSellerName(u.full_name ?? u.email ?? u.phone ?? userId);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, userId, sellerNameProp]);

  useEffect(() => {
    if (!accessToken || !userId) return;
    if (preset === "custom" && (!customFrom || !customTo)) return;
    setError(null);
    setKpis(null);
    const { start, end } = computeRange(preset, customFrom, customTo);
    analyticsApi
      .getSellerKpis(accessToken, userId, start, end)
      .then(setKpis)
      .catch((err) => setError(err instanceof ApiError ? err.detail : t.loadError));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, userId, preset, customFrom, customTo]);

  async function sendPdf() {
    if (!accessToken || !kpis) return;
    setSending(true);
    try {
      await notificationsApi.sendSellerKpiReport(accessToken, {
        seller_user_id: userId,
        period_start: kpis.period_start,
        period_end: kpis.period_end,
      });
      toast.success(t.sendPdfSuccess);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : t.sendPdfError);
    } finally {
      setSending(false);
    }
  }

  const presets: { key: PeriodPreset; label: string }[] = [
    { key: "today", label: t.periodToday },
    { key: "week", label: t.periodWeek },
    { key: "month", label: t.periodMonth },
    { key: "30d", label: t.period30 },
    { key: "custom", label: t.periodCustom },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-xl font-extrabold text-foreground sm:text-2xl">{sellerName ?? "—"}</h1>
        <Button variant="gold" size="sm" disabled={!kpis || sending} onClick={sendPdf}>
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {sending ? t.sendPdfSending : t.sendPdf}
        </Button>
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPreset(p.key)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                preset === p.key ? "border-primary bg-primary/12 text-primary" : "border-border text-foreground-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex gap-3">
            <FormField label={t.from} type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="mb-0" />
            <FormField label={t.to} type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="mb-0" />
          </div>
        )}
      </div>

      {error && (
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center">
          <AlertCircle size={28} className="text-destructive" />
          <p className="text-sm text-foreground-muted">{error}</p>
        </div>
      )}

      {!error && kpis === null && (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="text-primary animate-spin" />
        </div>
      )}

      {!error && kpis && (
        <>
          <SectionLabel>{t.sectionKpi}</SectionLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Tile
              label={t.conversion}
              value={kpis.conversion_pct === null ? "—" : `${kpis.conversion_pct}%`}
              hint={`${t.leads}: ${kpis.leads_count} → ${t.sales}: ${kpis.sales_count}`}
              tone="warning"
            />
            <Tile
              label={t.avgSale}
              value={kpis.sales_count ? formatMoney(Math.round(kpis.sales_total_uzs / kpis.sales_count), "UZS") : "—"}
            />
            <Tile
              label={t.followup}
              value={!kpis.followup_linked ? t.followupNotLinked : kpis.followup_pct === null ? t.followupUnavailable : `${kpis.followup_pct}%`}
              hint={kpis.followup_linked && kpis.followup_total !== null ? `${kpis.followup_total} ${t.followupTasks}` : undefined}
              tone={kpis.followup_linked && kpis.followup_pct !== null ? (kpis.followup_pct < 70 ? "danger" : "success") : undefined}
            />
            <Tile label={t.dailyTalkTime} value={formatSeconds(kpis.calls_daily_talk_seconds, lang)} />
            <Tile label={t.leadResponseTime} value={formatSeconds(kpis.lead_response_median_seconds, lang)} />
          </div>

          <SectionLabel>{t.sectionSales}</SectionLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Tile label={t.salesContracts} value={String(kpis.sales_count)} />
            {kpis.sales_by_mode.map((m) => (
              <Tile
                key={`${m.mode}-${m.currency}`}
                label={`${t.sales} - ${m.mode ? t[MODE_KEY[m.mode]] : t.modeUnset} (${m.currency})`}
                value={String(m.sales_count)}
                hint={`${t.agreed} ${formatMoney(m.agreed_amount, m.currency)} | ${t.collected} ${formatMoney(m.collected_amount, m.currency)}`}
              />
            ))}
          </div>

          <SectionLabel>{t.sectionCalls}</SectionLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Tile label={t.totalCalls} value={String(kpis.calls_total)} />
            <Tile label={t.outboundCalls} value={String(kpis.calls_outbound)} />
            <Tile label={t.inboundCalls} value={String(kpis.calls_inbound)} />
            <Tile
              label={t.missedCalls}
              value={kpis.calls_missed_pct === null ? "—" : `${kpis.calls_missed_pct}%`}
              tone={kpis.calls_missed_pct !== null && kpis.calls_missed_pct > 20 ? "danger" : "success"}
            />
            <Tile label={t.avgDuration} value={formatSeconds(kpis.calls_avg_duration_seconds, lang)} />
          </div>

          <SectionLabel>{t.sectionCrm}</SectionLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Tile label={t.crmNotes} value={String(kpis.crm_notes_count)} />
            <Tile label={t.crmStageChanges} value={String(kpis.crm_stage_changes_count)} />
          </div>

          <SectionLabel>{t.sectionLeads}</SectionLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Tile label={t.activeLeads} value={String(kpis.leads_active_count)} />
            <Tile label={t.newLeads} value={String(kpis.leads_count)} />
            <Tile label={t.wonLeads} value={String(kpis.leads_won_count)} tone="success" />
            <Tile label={t.lostLeads} value={String(kpis.leads_lost_count)} tone={kpis.leads_lost_count > 0 ? "danger" : undefined} />
            <Tile label={t.qualityLeads} value={String(kpis.leads_quality_count)} tone="success" />
            <Tile
              label={t.lowQualityLeads}
              value={String(kpis.leads_low_quality_count)}
              tone={kpis.leads_low_quality_count > 0 ? "danger" : undefined}
            />
          </div>

          <SectionLabel>{t.sectionFinance}</SectionLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Tile
              label={t.debtCollection}
              value={kpis.debt_collection_pct === null ? "—" : `${kpis.debt_collection_pct}%`}
              tone={kpis.debt_collection_pct !== null && kpis.debt_collection_pct < 70 ? "danger" : "success"}
            />
            <Tile
              label={t.refunds}
              value={kpis.refund_pct === null ? "—" : `${kpis.refund_pct}%`}
              tone={kpis.refund_pct !== null && kpis.refund_pct > 10 ? "danger" : "success"}
            />
          </div>
        </>
      )}
    </div>
  );
}
