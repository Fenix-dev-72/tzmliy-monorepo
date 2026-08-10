import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as tenantAuthApi from "@/lib/api/tenantAuth";
import { ApiError } from "@/lib/api/client";
import { AuthCard } from "@/components/auth/AuthCard";
import { OtpCodeInput } from "@/components/auth/OtpCodeInput";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    title: "Ikki faktorli tasdiqlash",
    sub: "Pochtangizga yuborilgan kodni kiriting",
    btn: "Tasdiqlash",
    back: "Orqaga qaytish",
    loading: "Yuklanmoqda...",
    error: "Kod noto'g'ri yoki muddati o'tgan",
    resend: "Kodni qayta yuborish",
    resendWait: (s: number) => `Qayta yuborish (${s}s)`,
    cooldownError: (s: number) => `Kod hozirgina yuborildi. ${s} soniyadan so'ng qayta urinib ko'ring`,
  },
  ru: {
    title: "Двухфакторная аутентификация",
    sub: "Введите код, отправленный на вашу почту",
    btn: "Подтвердить",
    back: "Вернуться назад",
    loading: "Загрузка...",
    error: "Код неверен или срок действия истёк",
    resend: "Отправить код повторно",
    resendWait: (s: number) => `Повторная отправка (${s}с)`,
    cooldownError: (s: number) => `Код только что отправлен. Повторите через ${s} с`,
  },
};

export function TwoFaVerifyView() {
  const { lang } = useLang();
  const t = content[lang];
  const navigate = useNavigate();
  const location = useLocation();
  const { completeLogin } = useTenantAuth();
  const state = location.state as { pendingToken?: string; resendAfterSeconds?: number } | null;

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(state?.resendAfterSeconds ?? 0);

  useEffect(() => {
    if (!state?.pendingToken) navigate("/login", { replace: true });
  }, [state, navigate]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  if (!state?.pendingToken) return null;

  async function handleVerify(submittedCode: string) {
    setLoading(true);
    setError(null);
    try {
      const tokens = await tenantAuthApi.verifyLogin2fa({ pending_token: state!.pendingToken!, code: submittedCode });
      await completeLogin(tokens);
      navigate("/dashboard");
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setError(null);
    try {
      const res = await tenantAuthApi.resendLogin2fa({ pending_token: state!.pendingToken! });
      setResendCooldown(res.resend_after_seconds);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const wait = err.retryAfterSeconds ?? 0;
        setResendCooldown(wait);
        setError(t.cooldownError(wait));
      } else {
        setError(t.error);
      }
    }
  }

  return (
    <AuthCard className="text-center">
      <div className="border-secondary/30 bg-secondary/12 mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border-[1.5px]">
        <Mail size={30} className="text-secondary" />
      </div>
      <h2 className="font-display mb-2 text-2xl font-bold text-foreground">{t.title}</h2>
      <p className="mx-auto mb-8 max-w-[280px] text-sm text-foreground-muted">{t.sub}</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length < 6 || loading) return;
          handleVerify(code);
        }}
      >
        <OtpCodeInput value={code} onChange={setCode} onComplete={handleVerify} />

        {error && <p className="text-destructive mt-4 text-[13px] font-medium">{error}</p>}

        <Button type="submit" variant="gold" size="lg" className="mt-6 w-full" disabled={code.length < 6 || loading}>
          {loading && <Loader2 size={16} className="animate-spin" />}
          {loading ? t.loading : t.btn}
        </Button>
      </form>

      <button
        type="button"
        onClick={handleResend}
        disabled={resendCooldown > 0}
        className="mx-auto mt-4 block text-[13px] font-medium text-foreground-muted disabled:opacity-50"
      >
        {resendCooldown > 0 ? t.resendWait(resendCooldown) : t.resend}
      </button>

      <button
        onClick={() => navigate("/login")}
        className="mx-auto mt-4 flex items-center justify-center gap-1.5 text-[13px] font-medium text-foreground-muted"
      >
        <ArrowLeft size={14} /> {t.back}
      </button>
    </AuthCard>
  );
}
