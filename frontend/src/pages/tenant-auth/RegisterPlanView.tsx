import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import { ApiError } from "@/lib/api/client";
import * as billingApi from "@/lib/api/billing";
import type { BillingPlan } from "@/lib/api/billing";
import { formatMoney } from "@/lib/format/money";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    title: "Tarifni tanlang",
    sub: "15 kun bepul sinab ko'ring yoki hoziroq tarifni tanlang",
    trialTitle: "15 kunlik bepul sinov",
    trialDesc: "To'lov ma'lumoti kerak emas. Muddat tugagach xohlagan tarifni tanlaysiz.",
    trialBtn: "Bepul sinov bilan boshlash",
    or: "yoki hoziroq tarif tanlang",
    perMonth: "/oy",
    users: "foydalanuvchi",
    payBtn: "Tanlash va to'lash",
    loadError: "Tariflarni yuklab bo'lmadi",
    need2fa: "To'lov qilish uchun avval hisobingizda 2FA yoqilgan bo'lishi kerak (Sozlamalar bo'limi tez orada qo'shiladi). Hozircha bepul sinov bilan davom eting.",
    genericError: "Xatolik yuz berdi, qayta urinib ko'ring",
  },
  ru: {
    title: "Выберите тариф",
    sub: "Попробуйте бесплатно 15 дней или выберите тариф сейчас",
    trialTitle: "15-дневный бесплатный период",
    trialDesc: "Платёжные данные не нужны. Тариф можно выбрать после окончания периода.",
    trialBtn: "Начать с бесплатного периода",
    or: "или выберите тариф сейчас",
    perMonth: "/мес",
    users: "пользователей",
    payBtn: "Выбрать и оплатить",
    loadError: "Не удалось загрузить тарифы",
    need2fa: "Для оплаты сначала нужно включить 2FA в аккаунте (раздел настроек скоро появится). Пока продолжите с бесплатным периодом.",
    genericError: "Произошла ошибка, попробуйте снова",
  },
};

export function RegisterPlanView() {
  const { lang } = useLang();
  const t = content[lang];
  const navigate = useNavigate();
  const { status, accessToken } = useTenantAuth();

  const [plans, setPlans] = useState<BillingPlan[] | null>(null);
  const [payingCode, setPayingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "anonymous") {
      navigate("/login", { replace: true });
    }
  }, [status, navigate]);

  useEffect(() => {
    if (!accessToken) return;
    billingApi
      .listPlans(accessToken)
      .then(setPlans)
      .catch(() => setError(t.loadError));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  if (status !== "authenticated" || !accessToken) return null;

  async function handlePay(planCode: string) {
    setError(null);
    setPayingCode(planCode);
    try {
      await billingApi.selectSubscription(accessToken!, { billing_plan_code: planCode });
      const result = await billingApi.initiatePayment(accessToken!, { provider: "click" });
      window.location.href = result.checkout_url;
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError(t.need2fa);
      } else {
        setError(t.genericError);
      }
    } finally {
      setPayingCode(null);
    }
  }

  return (
    <AuthCard maxWidth="640px">
      <div className="border-primary/25 bg-primary/12 mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl border">
        <Sparkles size={24} className="text-primary" />
      </div>
      <h2 className="font-display mb-1 text-center text-[28px] font-bold text-foreground">{t.title}</h2>
      <p className="mb-7 text-center text-sm text-foreground-muted">{t.sub}</p>

      <div className="bg-background/60 border-card-border mb-7 rounded-2xl border p-6 text-center">
        <div className="border-success/25 bg-success/12 mx-auto mb-4 flex size-12 items-center justify-center rounded-xl border">
          <CheckCircle2 size={22} className="text-success" />
        </div>
        <h3 className="font-heading mb-1 text-lg font-bold text-foreground">{t.trialTitle}</h3>
        <p className="mb-5 text-sm text-foreground-muted">{t.trialDesc}</p>
        <Button variant="gold" size="lg" className="w-full" onClick={() => navigate("/dashboard")}>
          {t.trialBtn}
        </Button>
      </div>

      <p className="mb-5 text-center text-[13px] text-foreground-muted">{t.or}</p>

      {error && <p className="text-destructive mb-5 text-center text-[13px] font-medium">{error}</p>}

      {plans === null ? (
        <div className="flex justify-center py-6">
          <Loader2 size={22} className="text-primary animate-spin" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {plans.map((plan) => (
            <div key={plan.code} className="border-card-border flex flex-col rounded-2xl border p-5">
              <span className="mb-1 text-sm font-bold text-foreground">{plan.name}</span>
              <span className="font-heading mb-1 text-xl font-extrabold text-foreground">
                {formatMoney(plan.price_amount, plan.currency)}
                <span className="text-xs font-medium text-foreground-muted">{t.perMonth}</span>
              </span>
              <span className="mb-4 text-xs text-foreground-muted">
                {plan.max_users} {t.users}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="mt-auto w-full"
                disabled={payingCode !== null}
                onClick={() => handlePay(plan.code)}
              >
                {payingCode === plan.code && <Loader2 size={14} className="animate-spin" />}
                {t.payBtn}
              </Button>
            </div>
          ))}
        </div>
      )}
    </AuthCard>
  );
}
