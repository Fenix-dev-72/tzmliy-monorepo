import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { Eye, EyeOff, Loader2, LogIn, Mail, Phone } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import { ApiError } from "@/lib/api/client";
import * as tenantAuthApi from "@/lib/api/tenantAuth";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const content = {
  uz: {
    title: "Xush kelibsiz",
    sub: "Hisobingizga kiring",
    tab1: "Parol bilan",
    tab2: "Telefon (OTP)",
    identifier: "Email yoki telefon raqami",
    password: "Parol",
    forgot: "Parolni unutdingizmi?",
    btn: "Kirish",
    phone: "Telefon raqami",
    sendCode: "Kod yuborish",
    genericError: "Email/telefon yoki parol xato",
    lockedError: "Biroz kuting va qayta urinib ko'ring",
    noAccount: "Hisobingiz yo'qmi?",
    register: "Ro'yxatdan o'ting",
  },
  ru: {
    title: "Добро пожаловать",
    sub: "Войдите в свой аккаунт",
    tab1: "С паролем",
    tab2: "Телефон (OTP)",
    identifier: "Email или номер телефона",
    password: "Пароль",
    forgot: "Забыли пароль?",
    btn: "Войти",
    phone: "Номер телефона",
    sendCode: "Отправить код",
    genericError: "Неверный email/телефон или пароль",
    lockedError: "Подождите немного и попробуйте снова",
    noAccount: "Нет аккаунта?",
    register: "Зарегистрируйтесь",
  },
};

const LOCKOUT_THRESHOLD = 5;

export function LoginView() {
  const { lang } = useLang();
  const t = content[lang];
  const navigate = useNavigate();
  const { login } = useTenantAuth();
  const [tab, setTab] = useState<"password" | "phone">("password");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
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
      <div className="border-primary/25 bg-primary/12 mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl border">
        <LogIn size={24} className="text-primary" />
      </div>
      <h2 className="font-heading mb-1 text-center text-2xl font-extrabold text-foreground">{t.title}</h2>
      <p className="mb-7 text-center text-sm text-foreground-muted">{t.sub}</p>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "password" | "phone")} className="mb-1">
        <TabsList>
          <TabsTrigger value="password">
            <Mail size={14} />
            {t.tab1}
          </TabsTrigger>
          <TabsTrigger value="phone">
            <Phone size={14} />
            {t.tab2}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="password" className="mt-5">
          <FormField
            label={t.identifier}
            type="text"
            placeholder="name@company.com / +998 90 123 45 67"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
          />
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
          <div className="mb-6 flex justify-end">
            <Link to="/login/forgot" className="text-primary text-[13px] font-semibold">
              {t.forgot}
            </Link>
          </div>
          {error && <p className="text-destructive mb-4 text-[13px] font-medium">{error}</p>}
          <Button variant="gold" size="lg" className="w-full" disabled={!canSubmitPassword || loading} onClick={handlePasswordLogin}>
            {loading && <Loader2 size={16} className="animate-spin" />}
            {t.btn}
          </Button>
        </TabsContent>

        <TabsContent value="phone" className="mt-5">
          <FormField label={t.phone} type="tel" placeholder="+998 90 123 45 67" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          {error && <p className="text-destructive mb-4 text-[13px] font-medium">{error}</p>}
          <Button variant="gold" size="lg" className="w-full" disabled={!canSubmitPhone || loading} onClick={handleSendOtp}>
            {loading && <Loader2 size={16} className="animate-spin" />}
            {t.sendCode}
          </Button>
        </TabsContent>
      </Tabs>

      <p className="mt-7 text-center text-[13px] text-foreground-muted">
        {t.noAccount}{" "}
        <Link to="/register" className="text-primary font-semibold">
          {t.register}
        </Link>
      </p>
    </AuthCard>
  );
}
