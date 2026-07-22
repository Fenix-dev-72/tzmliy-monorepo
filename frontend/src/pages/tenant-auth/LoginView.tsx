import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Phone, User } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import { ApiError } from "@/lib/api/client";
import * as tenantAuthApi from "@/lib/api/tenantAuth";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    identifier: "Email yoki foydalanuvchi nomi",
    identifierPlaceholder: "Email yoki foydalanuvchi nomingizni kiriting",
    password: "Parol",
    passwordPlaceholder: "Parolingizni kiriting",
    remember: "Meni eslab qol",
    forgot: "Parolni unutdingizmi?",
    btn: "Kirish",
    orPhone: "Telefon raqami orqali kirish",
    phone: "Telefon raqami",
    sendCode: "Kod yuborish",
    backToPassword: "Parol bilan kirish",
    genericError: "Email/telefon yoki parol xato",
    lockedError: "Biroz kuting va qayta urinib ko'ring",
    noAccount: "Hisobingiz yo'qmi?",
    register: "Ro'yxatdan o'tish",
  },
  ru: {
    identifier: "Email или имя пользователя",
    identifierPlaceholder: "Введите email или имя пользователя",
    password: "Пароль",
    passwordPlaceholder: "Введите пароль",
    remember: "Запомнить меня",
    forgot: "Забыли пароль?",
    btn: "Войти",
    orPhone: "Войти по номеру телефона",
    phone: "Номер телефона",
    sendCode: "Отправить код",
    backToPassword: "Войти с паролем",
    genericError: "Неверный email/телефон или пароль",
    lockedError: "Подождите немного и попробуйте снова",
    noAccount: "Нет аккаунта?",
    register: "Зарегистрироваться",
  },
};

const LOCKOUT_THRESHOLD = 5;

export function LoginView() {
  const { lang } = useLang();
  const t = content[lang];
  const navigate = useNavigate();
  const { login } = useTenantAuth();
  const [mode, setMode] = useState<"password" | "phone">("password");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failCount, setFailCount] = useState(0);

  const canSubmitPassword = identifier.trim().length > 0 && password.length > 0;
  const canSubmitPhone = phone.trim().length > 0;

  async function handlePasswordLogin() {
    setError(null);
    setLoading(true);
    try {
      const result = await login({ identifier: identifier.trim(), password });
      if (result.requires_2fa) {
        navigate("/login/2fa", { state: { pendingToken: result.pending_token } });
      } else {
        navigate("/dashboard");
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

  async function handleSendOtp() {
    setError(null);
    setLoading(true);
    try {
      await tenantAuthApi.requestOtp({ phone: phone.trim() });
      navigate("/login/otp", { state: { phone: phone.trim() } });
    } catch {
      // otp/request always returns 204 per backend contract; a network-level failure still lands here
      setError(t.genericError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard>
      {mode === "password" ? (
        <>
          <FormField
            label={t.identifier}
            type="text"
            placeholder={t.identifierPlaceholder}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            leftEl={<User size={16} className="text-foreground-muted" />}
          />
          <FormField
            label={t.password}
            type={showPass ? "text" : "password"}
            placeholder={t.passwordPlaceholder}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            leftEl={<Lock size={16} className="text-foreground-muted" />}
            rightEl={
              <button type="button" onClick={() => setShowPass((s) => !s)} className="text-foreground-muted">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />
          <div className="mb-6 flex items-center justify-between">
            <label className="flex items-center gap-2 text-[13px] text-foreground-muted">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="border-card-border accent-primary size-4 rounded"
              />
              {t.remember}
            </label>
            <Link to="/login/forgot" className="text-primary text-[13px] font-semibold">
              {t.forgot}
            </Link>
          </div>
          {error && <p className="text-destructive mb-4 text-[13px] font-medium">{error}</p>}
          <Button
            variant="gold"
            size="lg"
            className="w-full"
            disabled={!canSubmitPassword || loading}
            onClick={handlePasswordLogin}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : t.btn}
            {!loading && <ArrowRight size={16} />}
          </Button>

          <button
            type="button"
            onClick={() => {
              setError(null);
              setMode("phone");
            }}
            className="text-primary mx-auto mt-4 flex items-center justify-center gap-1.5 text-[13px] font-semibold"
          >
            <Phone size={13} /> {t.orPhone}
          </button>
        </>
      ) : (
        <>
          <FormField
            label={t.phone}
            type="tel"
            placeholder="+998 90 123 45 67"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            leftEl={<Phone size={16} className="text-foreground-muted" />}
          />
          {error && <p className="text-destructive mb-4 text-[13px] font-medium">{error}</p>}
          <Button
            variant="gold"
            size="lg"
            className="w-full"
            disabled={!canSubmitPhone || loading}
            onClick={handleSendOtp}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : t.sendCode}
            {!loading && <ArrowRight size={16} />}
          </Button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setMode("password");
            }}
            className="text-primary mx-auto mt-4 flex items-center justify-center gap-1.5 text-[13px] font-semibold"
          >
            {t.backToPassword}
          </button>
        </>
      )}

      <p className="mt-7 text-center text-[13px] text-foreground-muted">
        {t.noAccount}{" "}
        <Link to="/register" className="text-primary inline-flex items-center gap-1 font-semibold">
          {t.register} <ArrowRight size={13} />
        </Link>
      </p>
    </AuthCard>
  );
}
