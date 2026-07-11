import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ArrowLeft, Loader2, Phone } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as tenantAuthApi from "@/lib/api/tenantAuth";
import { AuthCard } from "@/components/auth/AuthCard";
import { OtpCodeInput } from "@/components/auth/OtpCodeInput";
import { Button } from "@/components/ui/button";

const content = {
  uz: { title: "OTP tasdiqlash", sent: "Kodni ushbu raqamga yubordik:", resend: "Kodni qayta yuborish", seconds: "soniya", verify: "Tasdiqlash", loading: "Yuklanmoqda...", back: "Orqaga", error: "Kod noto'g'ri" },
  ru: { title: "Подтверждение OTP", sent: "Мы отправили код на номер:", resend: "Отправить код повторно", seconds: "сек", verify: "Подтвердить", loading: "Загрузка...", back: "Назад", error: "Неверный код" },
};

export function OtpVerifyView() {
  const { lang } = useLang();
  const t = content[lang];
  const navigate = useNavigate();
  const location = useLocation();
  const { completeLogin } = useTenantAuth();
  const state = location.state as { phone?: string } | null;

  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state?.phone) {
      navigate("/login", { replace: true });
    }
  }, [state, navigate]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  if (!state?.phone) return null;

  async function handleVerify(submittedCode: string) {
    setLoading(true);
    setError(null);
    try {
      const tokens = await tenantAuthApi.verifyOtp({
        phone: state!.phone!,
        code: submittedCode,
      });
      await completeLogin(tokens);
      navigate("/dashboard");
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setCountdown(30);
    await tenantAuthApi.requestOtp({ phone: state!.phone! });
  }

  return (
    <AuthCard className="text-center">
      <div className="border-primary/25 bg-primary/12 mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border">
        <Phone size={28} className="text-primary" />
      </div>
      <h2 className="font-heading mb-2 text-2xl font-extrabold text-foreground">{t.title}</h2>
      <p className="mb-1 text-sm text-foreground-muted">{t.sent}</p>
      <p className="mb-8 text-[15px] font-bold text-foreground">{state.phone}</p>

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
        onClick={() => navigate("/login")}
        className="mx-auto mt-4 flex items-center justify-center gap-1.5 text-[13px] font-medium text-foreground-muted"
      >
        <ArrowLeft size={14} /> {t.back}
      </button>
    </AuthCard>
  );
}
