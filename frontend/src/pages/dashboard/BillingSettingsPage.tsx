import { useEffect, useState } from "react";
import { CheckCircle2, CreditCard, Lock, Loader2 } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import { useEntitlements } from "@/lib/billing/EntitlementsContext";
import { ApiError } from "@/lib/api/client";
import * as billingApi from "@/lib/api/billing";
import type { BillingPlan } from "@/lib/api/billing";
import { formatMoney } from "@/lib/format/money";
import { formatBytes } from "@/lib/format/storage";
import {
  FEATURE_CRM_INTEGRATIONS,
  FEATURE_META_ADS,
  FEATURE_TELEGRAM_NOTIFICATIONS,
  FEATURE_ADVANCED_REPORTS,
} from "@/lib/billing/features";
import { Button } from "@/components/ui/button";

const ALL_FEATURE_KEYS = [FEATURE_CRM_INTEGRATIONS, FEATURE_META_ADS, FEATURE_TELEGRAM_NOTIFICATIONS, FEATURE_ADVANCED_REPORTS];

const content = {
  uz: {
    title: "Obuna va tarif",
    currentPlan: "Joriy tarif",
    noPlan: "Tarif tanlanmagan",
    users: "Xodimlar",
    storage: "Xotira",
    features: "Funksiyalar",
    featureLabels: {
      crm_integrations: "CRM integratsiyalari",
      meta_ads: "Meta Ads integratsiyasi",
      telegram_notifications: "Telegram bot bildirishnomalari",
      advanced_reports: "Kengaytirilgan hisobot eksporti",
    } as Record<string, string>,
    availablePlans: "Boshqa tariflar",
    perMonth: "/oy",
    switchPlan: "Ushbu tarifga o'tish",
    currentBadge: "Joriy",
    need2fa: "To'lov qilish uchun avval hisobingizda 2FA yoqilgan bo'lishi kerak.",
    genericError: "Xatolik yuz berdi, qayta urinib ko'ring",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
  },
  ru: {
    title: "Подписка и тариф",
    currentPlan: "Текущий тариф",
    noPlan: "Тариф не выбран",
    users: "Сотрудники",
    storage: "Хранилище",
    features: "Функции",
    featureLabels: {
      crm_integrations: "CRM-интеграции",
      meta_ads: "Интеграция Meta Ads",
      telegram_notifications: "Уведомления через Telegram-бота",
      advanced_reports: "Расширенный экспорт отчётов",
    } as Record<string, string>,
    availablePlans: "Другие тарифы",
    perMonth: "/мес",
    switchPlan: "Перейти на этот тариф",
    currentBadge: "Текущий",
    need2fa: "Для оплаты сначала нужно включить 2FA в аккаунте.",
    genericError: "Произошла ошибка, попробуйте снова",
    loadError: "Не удалось загрузить данные",
  },
};

export function BillingSettingsPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken } = useTenantAuth();
  const { entitlements, refetch } = useEntitlements();

  const [plans, setPlans] = useState<BillingPlan[] | null>(null);
  const [switchingCode, setSwitchingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    billingApi
      .listPlans(accessToken)
      .then(setPlans)
      .catch(() => setError(t.loadError));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function handleSwitch(planCode: string) {
    if (!accessToken) return;
    setError(null);
    setSwitchingCode(planCode);
    try {
      await billingApi.selectSubscription(accessToken, { billing_plan_code: planCode });
      const result = await billingApi.initiatePayment(accessToken, { provider: "click" });
      window.location.href = result.checkout_url;
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setError(t.need2fa);
      else setError(err instanceof ApiError ? err.detail : t.genericError);
    } finally {
      setSwitchingCode(null);
      refetch();
    }
  }

  return (
    <main className="mx-auto max-w-[900px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="border-primary/25 bg-primary/12 flex size-11 items-center justify-center rounded-2xl border">
          <CreditCard size={20} className="text-primary" />
        </div>
        <h1 className="font-heading text-xl font-extrabold text-foreground">{t.title}</h1>
      </div>

      {error && <p className="text-destructive mb-4 text-[13px] font-medium">{error}</p>}

      <div className="glass-card mb-6 p-6">
        <h2 className="text-foreground-muted mb-4 text-xs font-semibold tracking-wide uppercase">{t.currentPlan}</h2>
        {!entitlements ? (
          <div className="bg-accent/60 h-16 animate-pulse rounded-xl" />
        ) : entitlements.plan_code === null ? (
          <p className="text-foreground-muted text-sm">{t.noPlan}</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <p className="font-heading text-lg font-bold text-foreground">{entitlements.plan_name}</p>
              <p className="font-mono text-foreground-muted text-xs">{entitlements.plan_code}</p>
            </div>
            <div>
              <p className="text-foreground-muted mb-1 text-xs">{t.users}</p>
              <p className="font-mono text-sm font-semibold text-foreground">
                {entitlements.current_user_count} / {entitlements.max_users ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-foreground-muted mb-1 text-xs">{t.storage}</p>
              <p className="font-mono text-sm font-semibold text-foreground">
                {entitlements.max_billable_storage_bytes !== null ? formatBytes(entitlements.max_billable_storage_bytes) : "—"}
              </p>
            </div>
          </div>
        )}

        {entitlements && (
          <div className="mt-5">
            <h3 className="text-foreground-muted mb-2 text-xs font-semibold tracking-wide uppercase">{t.features}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {ALL_FEATURE_KEYS.map((key) => {
                const unlocked = entitlements.feature_keys.includes(key);
                return (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    {unlocked ? (
                      <CheckCircle2 size={15} className="text-success shrink-0" />
                    ) : (
                      <Lock size={15} className="text-foreground-muted shrink-0" />
                    )}
                    <span className={unlocked ? "text-foreground" : "text-foreground-muted"}>{t.featureLabels[key]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <h2 className="text-foreground-muted mb-3 text-xs font-semibold tracking-wide uppercase">{t.availablePlans}</h2>
      {plans === null ? (
        <div className="text-foreground-muted flex justify-center py-10">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = plan.code === entitlements?.plan_code;
            return (
              <div key={plan.code} className={`flex flex-col rounded-2xl border p-5 ${isCurrent ? "border-primary" : "border-card-border"}`}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">{plan.name}</span>
                  {isCurrent && (
                    <span className="bg-primary/12 text-primary rounded-full px-2 py-0.5 text-[10.5px] font-semibold">
                      {t.currentBadge}
                    </span>
                  )}
                </div>
                <span className="font-heading mb-4 text-xl font-extrabold text-foreground">
                  {formatMoney(plan.price_amount, plan.currency)}
                  <span className="text-xs font-medium text-foreground-muted">{t.perMonth}</span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-auto w-full"
                  disabled={isCurrent || switchingCode !== null}
                  onClick={() => handleSwitch(plan.code)}
                >
                  {switchingCode === plan.code && <Loader2 size={14} className="animate-spin" />}
                  {t.switchPlan}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
