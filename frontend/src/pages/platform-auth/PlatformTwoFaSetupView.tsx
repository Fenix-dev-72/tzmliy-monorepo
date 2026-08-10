import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Loader2, Mail } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { usePlatformAuth } from "@/lib/auth/platformAuthStore";
import { ApiError } from "@/lib/api/client";
import { AuthCard } from "@/components/auth/AuthCard";
import { OtpCodeInput } from "@/components/auth/OtpCodeInput";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    title: "2FA sozlash (majburiy)",
    sub: "manziliga yuborilgan 6 xonali kodni kiriting.",
    btn: "Tasdiqlash",
    loading: "Yuklanmoqda...",
    error: "Kod noto'g'ri",
    loadError: "Kod yuborilmadi. Qayta urinib ko'ring",
    send: "Kodni yuborish",
    resend: "Kodni qayta yuborish",
    resendWait: (s: number) => `Qayta yuborish (${s}s)`,
    cooldownError: (s: number) => `Kod hozirgina yuborildi. ${s} soniyadan so'ng qayta urinib ko'ring`,
  },
  ru: {
    title: "Настройка 2FA (обязательно)",
    sub: "Введите 6-значный код, отправленный на",
    btn: "Подтвердить",
    loading: "Загрузка...",
    error: "Неверный код",
    loadError: "Не удалось отправить код. Попробуйте ещё раз",
    send: "Отправить код",
    resend: "Отправить код повторно",
    resendWait: (s: number) => `Повторная отправка (${s}с)`,
    cooldownError: (s: number) => `Код только что отправлен. Повторите через ${s} с`,
  },
};

export function PlatformTwoFaSetupView() {
  const { lang } = useLang();
  const t = content[lang];
  const navigate = useNavigate();
  const { status, totpEnabled, resendSetup2fa, confirm2fa } = usePlatformAuth();

  const [emailMasked, setEmailMasked] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const setupRequested = useRef(false);

  async function sendCode() {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      // Same cooldown-gated endpoint for the first send and an explicit
      // resend click -- the backend treats them identically, so the button
      // never needs to stay permanently disabled just because the initial
      // auto-fire below failed.
      const res = await resendSetup2fa();
      setEmailMasked(res.email_masked);
      setResendCooldown(res.resend_after_seconds);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const wait = err.retryAfterSeconds ?? 0;
        setResendCooldown(wait);
        setError(t.cooldownError(wait));
      } else {
        setError(t.loadError);
      }
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (status === "anonymous") {
      navigate("/platform/login", { replace: true });
      return;
    }
    if (totpEnabled) {
      navigate("/platform/dashboard", { replace: true });
      return;
    }
    // Guard against React 18 StrictMode's double effect-invocation in dev —
    // otherwise two /2fa/setup calls fire back-to-back, each re-sending a
    // fresh code and invalidating the previous one.
    if (status === "authenticated" && !setupRequested.current) {
      setupRequested.current = true;
      void sendCode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, totpEnabled]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  if (status !== "authenticated" || totpEnabled) return null;

  async function handleConfirm(submittedCode: string) {
    setLoading(true);
    setError(null);
    try {
      await confirm2fa(submittedCode);
      navigate("/platform/dashboard");
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard className="text-center">
      <div className="border-primary/25 bg-primary/12 mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border">
        <Mail size={28} className="text-primary" />
      </div>
      <h2 className="font-heading mb-2 text-2xl font-extrabold text-foreground">{t.title}</h2>

      {emailMasked ? (
        <>
          <p className="mx-auto mb-7 max-w-[320px] text-sm leading-relaxed text-foreground-muted">
            {lang === "uz" ? `${emailMasked} ${t.sub}` : `${t.sub} ${emailMasked}.`}
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length < 6 || loading) return;
              handleConfirm(code);
            }}
          >
            <OtpCodeInput value={code} onChange={setCode} onComplete={handleConfirm} />

            {error && <p className="text-destructive mt-4 text-[13px] font-medium">{error}</p>}

            <Button type="submit" variant="gold" size="lg" className="mt-6 w-full" disabled={code.length < 6 || loading}>
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? t.loading : t.btn}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => void sendCode()}
            disabled={sending || resendCooldown > 0}
            className="mx-auto mt-4 block text-[13px] font-medium text-foreground-muted disabled:opacity-50"
          >
            {resendCooldown > 0 ? t.resendWait(resendCooldown) : t.resend}
          </button>
        </>
      ) : sending ? (
        <div className="mb-7 flex justify-center py-4">
          <Loader2 size={24} className="text-primary animate-spin" />
        </div>
      ) : (
        <>
          {error && <p className="text-destructive mb-4 text-[13px] font-medium">{error}</p>}
          <Button
            variant="gold"
            size="lg"
            className="w-full"
            disabled={resendCooldown > 0}
            onClick={() => void sendCode()}
          >
            {resendCooldown > 0 ? t.resendWait(resendCooldown) : t.send}
          </Button>
        </>
      )}
    </AuthCard>
  );
}
