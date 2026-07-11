import { useEffect, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { AlertCircle, ArrowRight, Award, Check, Loader2, Plus, ShieldAlert, Wallet, X } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as financeApi from "@/lib/api/finance";
import type { AdjustmentRequest, BonusPlan, PayrollEntry } from "@/lib/api/finance";
import { ApiError } from "@/lib/api/client";
import { formatMoney } from "@/lib/format/money";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

const content = {
  uz: {
    title: "Moliya",
    sub: "Bonus rejalar, ish haqi va tuzatish so'rovlari",
    need2fa: "Moliyaviy amallar (to'lov, bonus, payroll) uchun 2FA yoqilgan bo'lishi kerak.",
    enable2fa: "2FA yoqish",
    tabBonus: "Bonus rejalar",
    tabPayroll: "Payroll",
    tabAdjustments: "Tuzatish so'rovlari",
    addPlan: "Yangi reja",
    planName: "Reja nomi",
    role: "Rol",
    commission: "Komissiya (%)",
    effectiveFrom: "Boshlanish sanasi",
    create: "Yaratish",
    cancel: "Bekor qilish",
    noPlans: "Hali bonus reja yo'q",
    periodStart: "Davr boshi",
    periodEnd: "Davr oxiri",
    calculate: "Hisoblash",
    noPayroll: "Hisoblangan payroll yo'q",
    employee: "Xodim",
    base: "Asosiy",
    bonus: "Bonus",
    total: "Jami",
    noAdjustments: "Tuzatish so'rovlari yo'q",
    approve: "Tasdiqlash",
    reject: "Rad etish",
    confirmApproveTitle: "So'rovni tasdiqlaysizmi?",
    confirmRejectTitle: "So'rovni rad etasizmi?",
    reason: "Sabab (ixtiyoriy)",
    statusPending: "Kutilmoqda",
    statusApproved: "Tasdiqlangan",
    statusRejected: "Rad etilgan",
    genericError: "Xatolik yuz berdi",
    created: "Yaratildi",
    updated: "Yangilandi",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
  },
  ru: {
    title: "Финансы",
    sub: "Бонусные планы, зарплата и заявки на корректировку",
    need2fa: "Для финансовых операций (платежи, бонусы, payroll) требуется включённая 2FA.",
    enable2fa: "Включить 2FA",
    tabBonus: "Бонусные планы",
    tabPayroll: "Payroll",
    tabAdjustments: "Заявки на корректировку",
    addPlan: "Новый план",
    planName: "Название плана",
    role: "Роль",
    commission: "Комиссия (%)",
    effectiveFrom: "Дата начала",
    create: "Создать",
    cancel: "Отмена",
    noPlans: "Бонусных планов пока нет",
    periodStart: "Начало периода",
    periodEnd: "Конец периода",
    calculate: "Рассчитать",
    noPayroll: "Рассчитанного payroll нет",
    employee: "Сотрудник",
    base: "База",
    bonus: "Бонус",
    total: "Итого",
    noAdjustments: "Заявок на корректировку нет",
    approve: "Одобрить",
    reject: "Отклонить",
    confirmApproveTitle: "Одобрить заявку?",
    confirmRejectTitle: "Отклонить заявку?",
    reason: "Причина (необязательно)",
    statusPending: "Ожидает",
    statusApproved: "Одобрена",
    statusRejected: "Отклонена",
    genericError: "Произошла ошибка",
    created: "Создано",
    updated: "Обновлено",
    loadError: "Не удалось загрузить данные",
  },
};

const STATUS_COLOR = { pending: "#D4AF37", approved: "#2FBF71", rejected: "#E5484D" };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function FinancePage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken, user } = useTenantAuth();
  const has2fa = Boolean(user?.totp_enabled);

  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [plans, setPlans] = useState<BonusPlan[] | null>(null);
  const [payroll, setPayroll] = useState<PayrollEntry[] | null>(null);
  const [adjustments, setAdjustments] = useState<AdjustmentRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [planFormOpen, setPlanFormOpen] = useState(false);
  const [planName, setPlanName] = useState("");
  const [planRoleId, setPlanRoleId] = useState("");
  const [planCommission, setPlanCommission] = useState("");
  const [planEffectiveFrom, setPlanEffectiveFrom] = useState(todayIso());
  const [savingPlan, setSavingPlan] = useState(false);

  const [periodStart, setPeriodStart] = useState(todayIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());
  const [calculating, setCalculating] = useState(false);

  const [reviewTarget, setReviewTarget] = useState<{ request: AdjustmentRequest; action: "approve" | "reject" } | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewing, setReviewing] = useState(false);

  async function load() {
    if (!accessToken) return;
    setError(null);
    try {
      const [plansData, adjustmentsData, rolesData, payrollData] = await Promise.all([
        financeApi.listBonusPlans(accessToken),
        financeApi.listAdjustmentRequests(accessToken),
        financeApi.listRolesForSelect(accessToken),
        financeApi.listPayrollEntries(accessToken),
      ]);
      setPlans(plansData);
      setAdjustments(adjustmentsData);
      setRoles(rolesData);
      setPayroll(payrollData);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.loadError);
    }
  }

  useEffect(() => {
    if (accessToken) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function handleCreatePlan() {
    if (!accessToken) return;
    setSavingPlan(true);
    try {
      await financeApi.createBonusPlan(accessToken, {
        name: planName.trim(),
        applies_to_role_id: planRoleId,
        commission_bps: Math.round(Number(planCommission) * 100),
        effective_from: `${planEffectiveFrom}T00:00:00`,
      });
      toast.success(t.created);
      setPlanName("");
      setPlanRoleId("");
      setPlanCommission("");
      setPlanFormOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 403 ? t.need2fa : t.genericError);
    } finally {
      setSavingPlan(false);
    }
  }

  async function handleCalculatePayroll() {
    if (!accessToken) return;
    setCalculating(true);
    try {
      const entries = await financeApi.calculatePayroll(accessToken, {
        period_start: `${periodStart}T00:00:00`,
        period_end: `${periodEnd}T23:59:59`,
      });
      setPayroll(entries);
      toast.success(t.updated);
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 403 ? t.need2fa : t.genericError);
    } finally {
      setCalculating(false);
    }
  }

  async function handleReview() {
    if (!accessToken || !reviewTarget) return;
    setReviewing(true);
    try {
      const body = { version: reviewTarget.request.version, review_reason: reviewReason.trim() || undefined };
      if (reviewTarget.action === "approve") {
        await financeApi.approveAdjustmentRequest(accessToken, reviewTarget.request.id, body);
      } else {
        await financeApi.rejectAdjustmentRequest(accessToken, reviewTarget.request.id, body);
      }
      toast.success(t.updated);
      setReviewTarget(null);
      setReviewReason("");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 403 ? t.need2fa : t.genericError);
    } finally {
      setReviewing(false);
    }
  }

  const canSubmitPlan = planName.trim().length > 0 && planRoleId.length > 0 && planCommission.trim().length > 0;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <h1 className="font-heading mb-1 text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
        <p className="text-sm text-foreground-muted">{t.sub}</p>
      </div>

      {!has2fa && (
        <div className="border-primary/25 bg-primary/8 mb-6 flex flex-wrap items-center gap-3 rounded-2xl border p-4">
          <ShieldAlert size={18} className="text-primary shrink-0" />
          <span className="flex-1 text-sm text-foreground">{t.need2fa}</span>
          <Link to="/dashboard/settings/2fa" className="text-primary flex items-center gap-1.5 text-sm font-semibold">
            {t.enable2fa}
            <ArrowRight size={14} />
          </Link>
        </div>
      )}

      {error && (
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center">
          <AlertCircle size={28} className="text-destructive" />
          <p className="text-sm text-foreground-muted">{error}</p>
        </div>
      )}

      {!error && (
        <Tabs defaultValue="bonus">
          <TabsList>
            <TabsTrigger value="bonus">
              <Award size={14} />
              {t.tabBonus}
            </TabsTrigger>
            <TabsTrigger value="payroll">
              <Wallet size={14} />
              {t.tabPayroll}
            </TabsTrigger>
            <TabsTrigger value="adjustments">{t.tabAdjustments}</TabsTrigger>
          </TabsList>

          <TabsContent value="bonus" className="mt-5">
            <div className="mb-4 flex justify-end">
              <Button variant="gold" size="sm" onClick={() => setPlanFormOpen((o) => !o)}>
                {planFormOpen ? <X size={14} /> : <Plus size={14} />}
                {t.addPlan}
              </Button>
            </div>

            {planFormOpen && (
              <div className="glass-card mb-5 p-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label={t.planName} value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="Sotuvchilar komissiyasi" />
                  <div>
                    <label className="text-foreground mb-1.5 block text-sm font-medium">{t.role}</label>
                    <select
                      value={planRoleId}
                      onChange={(e) => setPlanRoleId(e.target.value)}
                      className="border-card-border bg-input-background text-foreground focus-visible:border-ring focus-visible:ring-ring/15 h-11 w-full rounded-xl border px-3.5 text-sm outline-none focus-visible:ring-[3px]"
                    >
                      <option value="">—</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <FormField
                    label={t.commission}
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={planCommission}
                    onChange={(e) => setPlanCommission(e.target.value)}
                    placeholder="5"
                  />
                  <FormField
                    label={t.effectiveFrom}
                    type="date"
                    value={planEffectiveFrom}
                    onChange={(e) => setPlanEffectiveFrom(e.target.value)}
                  />
                </div>
                <div className="mt-2 flex gap-3">
                  <Button variant="gold" disabled={!canSubmitPlan || savingPlan} onClick={handleCreatePlan}>
                    {savingPlan && <Loader2 size={16} className="animate-spin" />}
                    {t.create}
                  </Button>
                  <Button variant="outline" onClick={() => setPlanFormOpen(false)}>
                    {t.cancel}
                  </Button>
                </div>
              </div>
            )}

            {plans === null ? (
              <div className="flex justify-center py-16">
                <Loader2 size={24} className="text-primary animate-spin" />
              </div>
            ) : plans.length === 0 ? (
              <p className="glass-card py-10 text-center text-sm text-foreground-muted">{t.noPlans}</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {plans.map((plan) => (
                  <div key={plan.id} className="glass-card p-5 transition-all hover:-translate-y-1">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm font-bold text-foreground">{plan.name}</span>
                      <span className="text-primary font-mono text-lg font-extrabold">{(plan.commission_bps / 100).toFixed(1)}%</span>
                    </div>
                    <span className="text-xs text-foreground-muted">
                      {new Date(plan.effective_from).toLocaleDateString()}
                      {plan.effective_to ? ` — ${new Date(plan.effective_to).toLocaleDateString()}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="payroll" className="mt-5">
            <div className="glass-card mb-5 flex flex-wrap items-end gap-4 p-5">
              <FormField label={t.periodStart} type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="mb-0" />
              <FormField label={t.periodEnd} type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="mb-0" />
              <Button variant="gold" disabled={calculating} onClick={handleCalculatePayroll}>
                {calculating && <Loader2 size={16} className="animate-spin" />}
                {t.calculate}
              </Button>
            </div>

            {payroll === null ? (
              <div className="flex justify-center py-16">
                <Loader2 size={24} className="text-primary animate-spin" />
              </div>
            ) : payroll.length === 0 ? (
              <p className="glass-card py-10 text-center text-sm text-foreground-muted">{t.noPayroll}</p>
            ) : (
              <div className="glass-card overflow-hidden p-0">
                {payroll.map((entry, i) => (
                  <div
                    key={entry.id}
                    className={`flex items-center justify-between gap-3 p-4 ${i < payroll.length - 1 ? "border-b border-card-border/60" : ""}`}
                  >
                    <span className="font-mono text-xs text-foreground-muted">{entry.user_id.slice(0, 8)}</span>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-foreground-muted">
                        {t.base}: <span className="font-mono text-foreground">{formatMoney(entry.base_amount, entry.currency)}</span>
                      </span>
                      <span className="text-foreground-muted">
                        {t.bonus}: <span className="font-mono text-success">{formatMoney(entry.bonus_amount, entry.currency)}</span>
                      </span>
                      <span className="font-mono text-primary font-bold">
                        {formatMoney(entry.base_amount + entry.bonus_amount, entry.currency)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="adjustments" className="mt-5">
            {adjustments === null ? (
              <div className="flex justify-center py-16">
                <Loader2 size={24} className="text-primary animate-spin" />
              </div>
            ) : adjustments.length === 0 ? (
              <p className="glass-card py-10 text-center text-sm text-foreground-muted">{t.noAdjustments}</p>
            ) : (
              <div className="glass-card overflow-hidden p-0">
                {adjustments.map((req, i) => (
                  <div
                    key={req.id}
                    className={`flex flex-wrap items-center justify-between gap-3 p-4 ${
                      i < adjustments.length - 1 ? "border-b border-card-border/60" : ""
                    }`}
                  >
                    <div>
                      <span className="text-sm font-semibold text-foreground">{req.type === "refund" ? "Refund" : "Tariff change"}</span>
                      <div className="text-xs text-foreground-muted">{new Date(req.created_at).toLocaleString()}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                        style={{
                          background: `${STATUS_COLOR[req.status]}15`,
                          borderColor: `${STATUS_COLOR[req.status]}30`,
                          color: STATUS_COLOR[req.status],
                        }}
                      >
                        {req.status === "pending" ? t.statusPending : req.status === "approved" ? t.statusApproved : t.statusRejected}
                      </span>
                      {req.status === "pending" && (
                        <>
                          <button
                            onClick={() => setReviewTarget({ request: req, action: "approve" })}
                            className="text-success flex size-8 items-center justify-center rounded-lg border border-success/25 bg-success/10"
                            aria-label={t.approve}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => setReviewTarget({ request: req, action: "reject" })}
                            className="text-destructive border-destructive/25 bg-destructive/10 flex size-8 items-center justify-center rounded-lg border"
                            aria-label={t.reject}
                          >
                            <X size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      <ConfirmDialog
        open={reviewTarget !== null}
        title={reviewTarget?.action === "approve" ? t.confirmApproveTitle : t.confirmRejectTitle}
        confirmLabel={reviewTarget?.action === "approve" ? t.approve : t.reject}
        cancelLabel={t.cancel}
        destructive={reviewTarget?.action === "reject"}
        loading={reviewing}
        onConfirm={handleReview}
        onCancel={() => {
          setReviewTarget(null);
          setReviewReason("");
        }}
      >
        <FormField label={t.reason} value={reviewReason} onChange={(e) => setReviewReason(e.target.value)} />
      </ConfirmDialog>
    </main>
  );
}
