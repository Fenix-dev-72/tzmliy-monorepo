import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { ApiError } from "@/lib/api/client";
import * as tenantAuthApi from "@/lib/api/tenantAuth";
import { AuthCard } from "@/components/auth/AuthCard";
import { OtpCodeInput } from "@/components/auth/OtpCodeInput";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    title: "Kodni tasdiqlang",
    sent: "Tasdiqlash kodini yubordik:",
    resend: "Kodni qayta yuborish",
    seconds: "soniya",
    verify: "Tasdiqlash",
    loading: "Yuklanmoqda...",
    error: "Kod noto'g'ri yoki muddati o'tgan",
    back: "Orqaga",
  },
  ru: {
    title: "Подтвердите код",
    sent: "Мы отправили код подтверждения на:",
    resend: "Отправить код повторно",
    seconds: "сек",
    verify: "Подтвердить",
    loading: "Загрузка...",
    error: "Неверный код или срок его действия истёк",
    back: "Назад",
  },
};

export function RegisterVerifyView() {
  const { lang } = useLang();
  const t = content[lang];
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { identifier?: string } | null;

  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state?.identifier) {
      navigate("/register", { replace: true });
    }
  }, [state, navigate]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  if (!state?.identifier) return null;

  async function handleVerify(submittedCode: string) {
    setLoading(true);
    setError(null);
    try {
      const { registration_token } = await tenantAuthApi.registerVerifyCode({
        identifier: state!.identifier!,
        code: submittedCode,
      });
      navigate("/register/complete", { state: { identifier: state!.identifier, registration_token } });
    } catch (err) {
      setError(err instanceof ApiError ? t.error : t.error);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setCountdown(30);
    try {
      await tenantAuthApi.registerRequestCode({ identifier: state!.identifier! });
    } catch {
      // identifier was already accepted once at step 1; a resend failing here is rare (already taken mid-flow)
    }
  }

  return (
    <AuthCard className="text-center">
      <div className="border-primary/25 bg-primary/12 mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border">
        <ShieldCheck size={28} className="text-primary" />
      </div>
      <h2 className="font-heading mb-2 text-2xl font-extrabold text-foreground">{t.title}</h2>
      <p className="mb-1 text-sm text-foreground-muted">{t.sent}</p>
      <p className="mb-8 text-[15px] font-bold text-foreground">{state.identifier}</p>

      <OtpCodeInput value={code} onChange={setCode} onComplete={handleVerify} />

      {error && <p className="text-destructive mt-4 text-[13px] font-medium">{error}</p>}

      <div className="my-6">
        {countdown > 0 ? (
          <span className="text-[13px] text-foreground-muted">
            {t.resend} {countdown} {t.seconds}
          </span>
        ) : (
          <button onClick={handleResend} className="text-primary text-[13px] font-semibold">
            {t.resend}
          </button>
        )}
      </div>

      <Button variant="gold" size="lg" className="w-full" disabled={code.length < 6 || loading} onClick={() => handleVerify(code)}>
        {loading && <Loader2 size={16} className="animate-spin" />}
        {loading ? t.loading : t.verify}
      </Button>
      <button
        onClick={() => navigate("/register")}
        className="mx-auto mt-4 flex items-center justify-center gap-1.5 text-[13px] font-medium text-foreground-muted"
      >
        <ArrowLeft size={14} /> {t.back}
      </button>
    </AuthCard>
  );
}
