import { useState } from "react";
import { useNavigate } from "react-router";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { usePlatformAuth } from "@/lib/auth/platformAuthStore";
import { ApiError } from "@/lib/api/client";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    badge: "Platform Admin",
    title: "Platform Admin panel",
    sub: "Faqat Dashboarduz jamoasi uchun",
    email: "Email manzil",
    password: "Parol",
    btn: "Kirish",
    genericError: "Email yoki parol xato",
    lockedError: "Biroz kuting va qayta urinib ko'ring",
  },
  ru: {
    badge: "Platform Admin",
    title: "Панель Platform Admin",
    sub: "Только для команды Dashboarduz",
    email: "Email адрес",
    password: "Пароль",
    btn: "Войти",
    genericError: "Неверный email или пароль",
    lockedError: "Подождите немного и попробуйте снова",
  },
};

const LOCKOUT_THRESHOLD = 5;

export function PlatformLoginView() {
  const { lang } = useLang();
  const t = content[lang];
  const navigate = useNavigate();
  const { login } = usePlatformAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failCount, setFailCount] = useState(0);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      const result = await login({ email, password });
      if (result.requires_2fa) {
        navigate("/platform/login/2fa", { state: { pendingToken: result.pending_token } });
      } else {
        // requires_2fa is only false when this account has no TOTP configured yet.
        navigate("/platform/2fa-setup");
      }
      setFailCount(0);
    } catch (err) {
      const nextCount = failCount + 1;
      setFailCount(nextCount);
      if (err instanceof ApiError && err.status === 401) {
        setError(nextCount >= LOCKOUT_THRESHOLD ? t.lockedError : t.genericError);
      } else {
        setError(t.genericError);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard>
      <div className="border-secondary/25 bg-secondary/10 mb-6 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5">
        <ShieldCheck size={14} className="text-secondary" />
        <span className="text-secondary text-[13px] font-semibold">{t.badge}</span>
      </div>
      <h2 className="font-heading mb-1 text-2xl font-extrabold text-foreground">{t.title}</h2>
      <p className="mb-7 text-sm text-foreground-muted">{t.sub}</p>

      <FormField label={t.email} type="email" placeholder="admin@dashboarduz.uz" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      <FormField
        label={t.password}
        type={showPass ? "text" : "password"}
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        rightEl={
          <button type="button" onClick={() => setShowPass((s) => !s)} className="text-foreground-muted">
            {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        }
      />

      {error && <p className="text-destructive mb-4 text-[13px] font-medium">{error}</p>}

      <Button
        variant="gold"
        size="lg"
        className="mt-2 w-full"
        disabled={!email || !password || loading}
        onClick={handleSubmit}
      >
        {loading && <Loader2 size={16} className="animate-spin" />}
        {t.btn}
      </Button>
    </AuthCard>
  );
}
