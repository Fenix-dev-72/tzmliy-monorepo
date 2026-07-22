import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ArrowLeft, Loader2, Shield } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as tenantAuthApi from "@/lib/api/tenantAuth";
import { AuthCard } from "@/components/auth/AuthCard";
import { OtpCodeInput } from "@/components/auth/OtpCodeInput";
import { Button } from "@/components/ui/button";

const content = {
  uz: { title: "Ikki faktorli tasdiqlash", sub: "Autentifikator ilovangizdan kodni kiriting", btn: "Tasdiqlash", back: "Orqaga qaytish", loading: "Yuklanmoqda...", error: "Kod noto'g'ri yoki muddati o'tgan" },
  ru: { title: "Двухфакторная аутентификация", sub: "Введите код из приложения-аутентификатора", btn: "Подтвердить", back: "Вернуться назад", loading: "Загрузка...", error: "Код неверен или срок действия истёк" },
};

export function TwoFaVerifyView() {
  const { lang } = useLang();
  const t = content[lang];
  const navigate = useNavigate();
  const location = useLocation();
  const { completeLogin } = useTenantAuth();
  const state = location.state as { pendingToken?: string } | null;

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state?.pendingToken) navigate("/login", { replace: true });
  }, [state, navigate]);

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

  return (
    <AuthCard className="text-center">
      <div className="border-secondary/30 bg-secondary/12 mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border-[1.5px]">
        <Shield size={30} className="text-secondary" />
      </div>
      <h2 className="font-display mb-2 text-2xl font-bold text-foreground">{t.title}</h2>
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
        onClick={() => navigate("/login")}
        className="mx-auto mt-4 flex items-center justify-center gap-1.5 text-[13px] font-medium text-foreground-muted"
      >
        <ArrowLeft size={14} /> {t.back}
      </button>
    </AuthCard>
  );
}
