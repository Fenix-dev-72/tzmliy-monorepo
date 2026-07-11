import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { ApiError } from "@/lib/api/client";
import * as tenantAuthApi from "@/lib/api/tenantAuth";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    title: "Yangi parol",
    sub: "Xavfsiz yangi parol o'rnating",
    password: "Yangi parol",
    confirm: "Parolni tasdiqlang",
    btn: "Parolni o'rnatish",
    mismatch: "Parollar mos kelmadi",
    invalidLink: "Havola yaroqsiz yoki muddati o'tgan",
    success: "Parol muvaffaqiyatli o'rnatildi. Endi kirishingiz mumkin.",
    toLogin: "Kirish sahifasiga o'tish",
  },
  ru: {
    title: "Новый пароль",
    sub: "Установите надёжный новый пароль",
    password: "Новый пароль",
    confirm: "Подтвердите пароль",
    btn: "Установить пароль",
    mismatch: "Пароли не совпадают",
    invalidLink: "Ссылка недействительна или срок её действия истёк",
    success: "Пароль успешно установлен. Теперь вы можете войти.",
    toLogin: "Перейти на страницу входа",
  },
};

export function NewPasswordView() {
  const { lang } = useLang();
  const t = content[lang];
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const token = searchParams.get("token") ?? "";
  const identifier = searchParams.get("identifier") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!token || !identifier) {
    return (
      <AuthCard className="text-center">
        <p className="text-destructive text-sm font-medium">{t.invalidLink}</p>
      </AuthCard>
    );
  }

  if (success) {
    return (
      <AuthCard className="text-center">
        <h2 className="font-heading mb-3 text-2xl font-extrabold text-foreground">{t.title}</h2>
        <p className="mb-8 text-sm text-foreground-muted">{t.success}</p>
        <Button variant="gold" size="lg" className="w-full" onClick={() => navigate("/login")}>
          {t.toLogin}
        </Button>
      </AuthCard>
    );
  }

  async function handleSubmit() {
    if (password !== confirm) {
      setError(t.mismatch);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await tenantAuthApi.confirmPasswordReset({ identifier, token, new_password: password });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.invalidLink);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard>
      <h2 className="font-heading mb-2 text-2xl font-extrabold text-foreground">{t.title}</h2>
      <p className="mb-7 text-sm text-foreground-muted">{t.sub}</p>

      <FormField
        label={t.password}
        type={showPass ? "text" : "password"}
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        rightEl={
          <button type="button" onClick={() => setShowPass((s) => !s)} className="text-foreground-muted">
            {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        }
      />
      <PasswordStrengthMeter password={password} />

      <div className="mt-4">
        <FormField
          label={t.confirm}
          type="password"
          placeholder="••••••••"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      {error && <p className="text-destructive mb-4 text-[13px] font-medium">{error}</p>}

      <Button
        variant="gold"
        size="lg"
        className="mt-2 w-full"
        disabled={!password || !confirm || loading}
        onClick={handleSubmit}
      >
        {loading && <Loader2 size={16} className="animate-spin" />}
        {t.btn}
      </Button>
    </AuthCard>
  );
}
