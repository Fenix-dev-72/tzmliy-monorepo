import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Building2, Eye, EyeOff, Loader2 } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import { ApiError } from "@/lib/api/client";
import * as tenantAuthApi from "@/lib/api/tenantAuth";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    title: "Kompaniya ma'lumotlari",
    sub: "Oxirgi qadam — kompaniyangiz va parolingizni kiriting",
    name: "Kompaniya nomi",
    slug: "Identifikator (slug)",
    slugHint: "Faqat kichik lotin harflari, raqam va tire",
    slugError: "Identifikator faqat kichik lotin harflari, raqam va tire (-) dan iborat bo'lishi kerak",
    password: "Parol",
    confirm: "Parolni tasdiqlang",
    mismatch: "Parollar mos kelmadi",
    btn: "Ro'yxatdan o'tishni yakunlash",
    genericError: "Xatolik yuz berdi, qayta urinib ko'ring",
    slugTaken: "Bu identifikator band, boshqasini tanlang",
  },
  ru: {
    title: "Данные компании",
    sub: "Последний шаг — укажите компанию и пароль",
    name: "Название компании",
    slug: "Идентификатор (slug)",
    slugHint: "Только строчные латинские буквы, цифры и дефис",
    slugError: "Идентификатор может содержать только строчные латинские буквы, цифры и дефис (-)",
    password: "Пароль",
    confirm: "Подтвердите пароль",
    mismatch: "Пароли не совпадают",
    btn: "Завершить регистрацию",
    genericError: "Произошла ошибка, попробуйте снова",
    slugTaken: "Этот идентификатор занят, выберите другой",
  },
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function RegisterCompleteView() {
  const { lang } = useLang();
  const t = content[lang];
  const navigate = useNavigate();
  const location = useLocation();
  const { completeLogin } = useTenantAuth();
  const state = location.state as { identifier?: string; registration_token?: string } | null;

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state?.registration_token) {
      navigate("/register", { replace: true });
    }
  }, [state, navigate]);

  if (!state?.registration_token) return null;

  const slugValid = /^[a-z0-9-]+$/.test(slug) && slug.length > 0;
  const canSubmit = name.trim().length > 0 && slugValid && password.length > 0 && password === confirm;

  async function handleSubmit() {
    if (password !== confirm) {
      setError(t.mismatch);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const tokens = await tenantAuthApi.completeRegistration({
        registration_token: state!.registration_token!,
        company_name: name.trim(),
        slug,
        password,
      });
      await completeLogin(tokens);
      navigate("/register/plan");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(err.detail.toLowerCase().includes("slug") ? t.slugTaken : t.genericError);
      } else {
        setError(t.genericError);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard maxWidth="480px">
      <div className="border-primary/25 bg-primary/12 mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl border">
        <Building2 size={24} className="text-primary" />
      </div>
      <h2 className="font-heading mb-1 text-center text-2xl font-extrabold text-foreground">{t.title}</h2>
      <p className="mb-7 text-center text-sm text-foreground-muted">{t.sub}</p>

      <FormField
        label={t.name}
        placeholder="Acme LLC"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (!slugTouched) setSlug(slugify(e.target.value));
        }}
      />
      <FormField
        label={t.slug}
        placeholder="acme-llc"
        value={slug}
        onChange={(e) => {
          setSlugTouched(true);
          setSlug(slugify(e.target.value));
        }}
        hint={t.slugHint}
        error={slug.length > 0 && !slugValid ? t.slugError : undefined}
      />
      <FormField
        label={t.password}
        type={showPass ? "text" : "password"}
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
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
          autoComplete="new-password"
        />
      </div>

      {error && <p className="text-destructive mb-4 text-[13px] font-medium">{error}</p>}

      <Button variant="gold" size="lg" className="mt-2 w-full" disabled={!canSubmit || loading} onClick={handleSubmit}>
        {loading && <Loader2 size={16} className="animate-spin" />}
        {t.btn}
      </Button>
    </AuthCard>
  );
}
