import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Loader2, Megaphone } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { usePlatformAuth } from "@/lib/auth/platformAuthStore";
import { ApiError } from "@/lib/api/client";
import * as billingApi from "@/lib/api/billing";
import type { BillingPlan } from "@/lib/api/billing";
import * as notificationsApi from "@/lib/api/notifications";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const content = {
  uz: {
    title: "Xabar yuborish",
    sub: "Barcha tenant adminlariga yoki muayyan tarif egalariga bildirishnoma yuboring — bell orqali yetadi.",
    audienceAll: "Barchaga",
    audiencePlan: "Muayyan tarif egalariga",
    planLabel: "Tarif",
    planPlaceholder: "Tarifni tanlang",
    titleLabel: "Sarlavha",
    titlePlaceholder: "Masalan: Yangi imkoniyat qo'shildi",
    bodyLabel: "Matn",
    bodyPlaceholder: "Xabar matnini yozing...",
    reason: "Sabab (audit uchun, kamida 3 belgi)",
    reasonPlaceholder: "Masalan: Yangi funksiya haqida xabar berish",
    send: "Yuborish",
    sending: "Yuborilmoqda...",
    sentTemplate: (tenants: number, admins: number) => `${tenants} ta tenant, ${admins} ta adminga yetkazildi`,
    genericError: "Xatolik yuz berdi, qayta urinib ko'ring",
    need2fa: "Xabar yuborish uchun avval hisobingizda 2FA yoqilgan bo'lishi kerak.",
    go2fa: "2FA sozlashga o'tish",
  },
  ru: {
    title: "Отправить сообщение",
    sub: "Отправьте уведомление всем администраторам тенантов или владельцам определённого тарифа — придёт через колокольчик.",
    audienceAll: "Всем",
    audiencePlan: "Владельцам определённого тарифа",
    planLabel: "Тариф",
    planPlaceholder: "Выберите тариф",
    titleLabel: "Заголовок",
    titlePlaceholder: "Например: Добавлена новая функция",
    bodyLabel: "Текст",
    bodyPlaceholder: "Напишите текст сообщения...",
    reason: "Причина (для аудита, минимум 3 символа)",
    reasonPlaceholder: "Например: Уведомление о новой функции",
    send: "Отправить",
    sending: "Отправка...",
    sentTemplate: (tenants: number, admins: number) => `Доставлено ${tenants} тенантам, ${admins} администраторам`,
    genericError: "Произошла ошибка, попробуйте снова",
    need2fa: "Для отправки сообщений сначала нужно включить 2FA в аккаунте.",
    go2fa: "Перейти к настройке 2FA",
  },
};

export function PlatformBroadcastView() {
  const { lang } = useLang();
  const t = content[lang];
  const navigate = useNavigate();
  const { status, totpEnabled, accessToken } = usePlatformAuth();

  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [audience, setAudience] = useState<"all" | "plan">("all");
  const [planId, setPlanId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "anonymous") navigate("/platform/login", { replace: true });
  }, [status, navigate]);

  useEffect(() => {
    if (!accessToken) return;
    billingApi.listPlatformPlans(accessToken).then(setPlans).catch(() => {});
  }, [accessToken]);

  if (status !== "authenticated" || !accessToken) return null;

  if (!totpEnabled) {
    return (
      <main className="mx-auto max-w-[640px] px-4 py-8 sm:px-6 sm:py-10">
        <div className="glass-card p-6 text-center">
          <p className="text-foreground-muted mb-4 text-sm">{t.need2fa}</p>
          <Button variant="gold" size="lg" onClick={() => navigate("/platform/2fa-setup")}>
            {t.go2fa}
          </Button>
        </div>
      </main>
    );
  }

  const canSubmit =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    reason.trim().length >= 3 &&
    (audience === "all" || planId.length > 0);

  async function handleSend() {
    if (!canSubmit) return;
    setSending(true);
    setError(null);
    try {
      const result = await notificationsApi.sendBroadcast(accessToken!, {
        audience,
        billing_plan_id: audience === "plan" ? planId : null,
        title: title.trim(),
        body: body.trim(),
        reason: reason.trim(),
      });
      toast.success(t.sentTemplate(result.tenants_reached, result.admins_notified));
      setTitle("");
      setBody("");
      setReason("");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.genericError);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center gap-2.5">
        <Megaphone size={22} className="text-primary" />
        <div>
          <h1 className="font-heading text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
          <p className="text-sm text-foreground-muted">{t.sub}</p>
        </div>
      </div>

      <div className="glass-card p-5 sm:p-6">
        <Label className="mb-1.5">{t.audienceAll} / {t.audiencePlan}</Label>
        <div className="mb-4 flex gap-2">
          <Button
            type="button"
            variant={audience === "all" ? "gold" : "outline"}
            size="sm"
            onClick={() => setAudience("all")}
          >
            {t.audienceAll}
          </Button>
          <Button
            type="button"
            variant={audience === "plan" ? "gold" : "outline"}
            size="sm"
            onClick={() => setAudience("plan")}
          >
            {t.audiencePlan}
          </Button>
        </div>

        {audience === "plan" && (
          <div className="mb-4">
            <Label className="mb-1.5">{t.planLabel}</Label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="border-card-border bg-input-background text-foreground w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
            >
              <option value="">{t.planPlaceholder}</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <FormField
          label={t.titleLabel}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.titlePlaceholder}
        />

        <Label className="mb-1.5">{t.bodyLabel}</Label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t.bodyPlaceholder}
          rows={5}
          className="border-card-border bg-input-background text-foreground mb-4 w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
        />

        <FormField
          label={t.reason}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t.reasonPlaceholder}
        />

        {error && <p className="text-destructive mb-4 text-[13px] font-medium">{error}</p>}

        <Button variant="gold" disabled={!canSubmit || sending} onClick={handleSend}>
          {sending && <Loader2 size={16} className="animate-spin" />}
          {sending ? t.sending : t.send}
        </Button>
      </div>
    </main>
  );
}
