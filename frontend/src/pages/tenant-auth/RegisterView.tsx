import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { Loader2, Mail } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { ApiError } from "@/lib/api/client";
import * as tenantAuthApi from "@/lib/api/tenantAuth";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    title: "Kompaniyangizni ro'yxatdan o'tkazing",
    sub: "Email yoki telefon raqamingizni kiriting — tasdiqlash kodi yuboramiz",
    identifier: "Email yoki telefon raqami",
    btn: "Kod yuborish",
    taken: "Bu email/telefon allaqachon ro'yxatdan o'tgan",
    genericError: "Xatolik yuz berdi, qayta urinib ko'ring",
    hasAccount: "Hisobingiz bormi?",
    login: "Kirish",
  },
  ru: {
    title: "Зарегистрируйте свою компанию",
    sub: "Введите email или номер телефона — мы отправим код подтверждения",
    identifier: "Email или номер телефона",
    btn: "Отправить код",
    taken: "Этот email/телефон уже зарегистрирован",
    genericError: "Произошла ошибка, попробуйте снова",
    hasAccount: "Уже есть аккаунт?",
    login: "Войти",
  },
};

export function RegisterView() {
  const { lang } = useLang();
  const t = content[lang];
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = identifier.trim().length > 0;

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      await tenantAuthApi.registerRequestCode({ identifier: identifier.trim() });
      navigate("/register/verify", { state: { identifier: identifier.trim() } });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(t.taken);
      } else {
        setError(t.genericError);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard>
      <div className="border-primary/25 bg-primary/12 mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl border">
        <Mail size={24} className="text-primary" />
      </div>
      <h2 className="font-heading mb-1 text-center text-2xl font-extrabold text-foreground">{t.title}</h2>
      <p className="mb-7 text-center text-sm text-foreground-muted">{t.sub}</p>

      <FormField
        label={t.identifier}
        type="text"
        placeholder="name@company.com / +998 90 123 45 67"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        autoComplete="username"
      />

      {error && <p className="text-destructive mb-4 text-[13px] font-medium">{error}</p>}

      <Button variant="gold" size="lg" className="w-full" disabled={!canSubmit || loading} onClick={handleSubmit}>
        {loading && <Loader2 size={16} className="animate-spin" />}
        {t.btn}
      </Button>

      <p className="mt-7 text-center text-[13px] text-foreground-muted">
        {t.hasAccount}{" "}
        <Link to="/login" className="text-primary font-semibold">
          {t.login}
        </Link>
      </p>
    </AuthCard>
  );
}
