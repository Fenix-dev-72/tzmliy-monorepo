import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ArrowLeft, Loader2, Shield } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { usePlatformAuth } from "@/lib/auth/platformAuthStore";
import * as platformAuthApi from "@/lib/api/platformAuth";
import { AuthCard } from "@/components/auth/AuthCard";
import { OtpCodeInput } from "@/components/auth/OtpCodeInput";
import { Button } from "@/components/ui/button";

const content = {
  uz: { title: "Ikki faktorli tasdiqlash", sub: "Autentifikator ilovangizdan kodni kiriting", btn: "Tasdiqlash", back: "Orqaga qaytish", loading: "Yuklanmoqda...", error: "Kod noto'g'ri yoki muddati o'tgan" },
  ru: { title: "Двухфакторная аутентификация", sub: "Введите код из приложения-аутентификатора", btn: "Подтвердить", back: "Вернуться назад", loading: "Загрузка...", error: "Код неверен или срок действия истёк" },
};

export function PlatformTwoFaVerifyView() {
  const { lang } = useLang();
  const t = content[lang];
  const navigate = useNavigate();
  const location = useLocation();
  const { completeLogin } = usePlatformAuth();
  const state = location.state as { pendingToken?: string } | null;

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state?.pendingToken) navigate("/platform/login", { replace: true });
  }, [state, navigate]);

  if (!state?.pendingToken) return null;

  async function handleVerify(submittedCode: string) {
    setLoading(true);
    setError(null);
    try {
      const tokens = await platformAuthApi.verifyLogin2fa({ pending_token: state!.pendingToken!, code: submittedCode });
      completeLogin(tokens);
      navigate("/platform/welcome");
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard className="text-center">
      <div className="border-secondary/30 bg-secondary/12 mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border-[1.5px]">
        <Shield size={30} className="text-secondary" />
      </div>
      <h2 className="font-heading mb-2 text-[22px] font-extrabold text-foreground">{t.title}</h2>
      <p className="mx-auto mb-8 max-w-[280px] text-sm text-foreground-muted">{t.sub}</p>

      <OtpCodeInput value={code} onChange={setCode} onComplete={handleVerify} />

      {error && <p className="text-destructive mt-4 text-[13px] font-medium">{error}</p>}

      <Button
        variant="gold"
        size="lg"
        className="mt-6 w-full"
        disabled={code.length < 6 || loading}
        onClick={() => handleVerify(code)}
      >
        {loading && <Loader2 size={16} className="animate-spin" />}
        {loading ? t.loading : t.btn}
      </Button>
      <button
        onClick={() => navigate("/platform/login")}
        className="mx-auto mt-4 flex items-center justify-center gap-1.5 text-[13px] font-medium text-foreground-muted"
      >
        <ArrowLeft size={14} /> {t.back}
      </button>
    </AuthCard>
  );
}
