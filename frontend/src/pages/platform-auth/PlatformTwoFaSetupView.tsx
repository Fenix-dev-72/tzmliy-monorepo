import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, ShieldCheck } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { usePlatformAuth } from "@/lib/auth/platformAuthStore";
import { AuthCard } from "@/components/auth/AuthCard";
import { OtpCodeInput } from "@/components/auth/OtpCodeInput";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    title: "2FA sozlash (majburiy)",
    sub: "Google Authenticator yoki Authy ilovasi bilan QR kodni skanerlang, so'ng kodni kiriting.",
    secretLabel: "Yoki qo'lda kiriting:",
    btn: "Tasdiqlash",
    loading: "Yuklanmoqda...",
    error: "Kod noto'g'ri",
    loadError: "QR kod yuklanmadi, sahifani yangilang",
  },
  ru: {
    title: "Настройка 2FA (обязательно)",
    sub: "Отсканируйте QR-код в Google Authenticator или Authy, затем введите код.",
    secretLabel: "Или введите вручную:",
    btn: "Подтвердить",
    loading: "Загрузка...",
    error: "Неверный код",
    loadError: "Не удалось загрузить QR-код, обновите страницу",
  },
};

export function PlatformTwoFaSetupView() {
  const { lang } = useLang();
  const t = content[lang];
  const navigate = useNavigate();
  const { status, totpEnabled, setup2fa, confirm2fa } = usePlatformAuth();

  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setupRequested = useRef(false);

  useEffect(() => {
    if (status === "anonymous") {
      navigate("/platform/login", { replace: true });
      return;
    }
    if (totpEnabled) {
      navigate("/platform/welcome", { replace: true });
      return;
    }
    // Guard against React 18 StrictMode's double effect-invocation in dev —
    // otherwise two /2fa/setup calls fire back-to-back, each overwriting the
    // pending secret server-side, so whichever QR the user scans can end up
    // stale relative to what the backend actually validates against.
    if (status === "authenticated" && !setupRequested.current) {
      setupRequested.current = true;
      setup2fa()
        .then((res) => {
          setOtpauthUri(res.otpauth_uri);
          setSecret(res.secret);
        })
        .catch(() => setError(t.loadError));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, totpEnabled]);

  if (status !== "authenticated" || totpEnabled) return null;

  async function handleConfirm(submittedCode: string) {
    setLoading(true);
    setError(null);
    try {
      await confirm2fa(submittedCode);
      navigate("/platform/welcome");
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard className="text-center">
      <div className="border-primary/25 bg-primary/12 mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border">
        <ShieldCheck size={28} className="text-primary" />
      </div>
      <h2 className="font-heading mb-2 text-2xl font-extrabold text-foreground">{t.title}</h2>
      <p className="mx-auto mb-7 max-w-[320px] text-sm leading-relaxed text-foreground-muted">{t.sub}</p>

      {otpauthUri ? (
        <div className="mx-auto mb-3 w-fit rounded-2xl bg-white p-4">
          <QRCodeSVG value={otpauthUri} size={180} />
        </div>
      ) : (
        <div className="mb-3 flex justify-center py-10">
          <Loader2 size={24} className="text-primary animate-spin" />
        </div>
      )}

      {secret && (
        <p className="font-mono mb-7 text-xs break-all text-foreground-muted">
          {t.secretLabel} {secret}
        </p>
      )}

      <OtpCodeInput value={code} onChange={setCode} onComplete={handleConfirm} />

      {error && <p className="text-destructive mt-4 text-[13px] font-medium">{error}</p>}

      <Button
        variant="gold"
        size="lg"
        className="mt-6 w-full"
        disabled={code.length < 6 || loading || !otpauthUri}
        onClick={() => handleConfirm(code)}
      >
        {loading && <Loader2 size={16} className="animate-spin" />}
        {loading ? t.loading : t.btn}
      </Button>
    </AuthCard>
  );
}
