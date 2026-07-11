import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Building2, CheckCircle2, Eye, EyeOff, Loader2, UserPlus } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { usePlatformAuth } from "@/lib/auth/platformAuthStore";
import { ApiError } from "@/lib/api/client";
import * as platformTenantsApi from "@/lib/api/platformTenants";
import type { Tenant } from "@/lib/api/platformTenants";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    step1Title: "Yangi tenant (kompaniya)",
    step1Sub: "1-qadam: kompaniyani ro'yxatga oling",
    name: "Kompaniya nomi",
    slug: "Identifikator (slug)",
    slugHint: "Faqat kichik lotin harflari, raqam va tire — bu tenant login sahifasida ishlatiladi",
    slugError: "Identifikator faqat kichik lotin harflari, raqam va tire (-) dan iborat bo'lishi kerak",
    next: "Davom etish",
    step2Title: "Birinchi Admin foydalanuvchi",
    step2Sub: "2-qadam: shu tenant uchun Admin hisobini yarating",
    email: "Admin email",
    password: "Admin parol",
    reason: "Sabab (audit uchun, kamida 3 belgi)",
    reasonPlaceholder: "Masalan: Yangi mijoz bilan shartnoma imzolandi",
    create: "Admin yaratish",
    successTitle: "Tenant tayyor!",
    successDesc: "Endi shu ma'lumotlar bilan tenant login sahifasidan kirishingiz mumkin.",
    tenantSlugLabel: "Tenant identifikatori",
    adminEmailLabel: "Admin email",
    goToLogin: "Tenant login sahifasiga o'tish",
    createAnother: "Yana bir tenant yaratish",
    genericError: "Xatolik yuz berdi, qayta urinib ko'ring",
  },
  ru: {
    step1Title: "Новый тенант (компания)",
    step1Sub: "Шаг 1: зарегистрируйте компанию",
    name: "Название компании",
    slug: "Идентификатор (slug)",
    slugHint: "Только строчные латинские буквы, цифры и дефис — используется на странице входа тенанта",
    slugError: "Идентификатор может содержать только строчные латинские буквы, цифры и дефис (-)",
    next: "Продолжить",
    step2Title: "Первый Admin пользователь",
    step2Sub: "Шаг 2: создайте аккаунт Admin для этого тенанта",
    email: "Email админа",
    password: "Пароль админа",
    reason: "Причина (для аудита, минимум 3 символа)",
    reasonPlaceholder: "Например: Подписан договор с новым клиентом",
    create: "Создать админа",
    successTitle: "Тенант готов!",
    successDesc: "Теперь можно войти с этими данными на странице входа тенанта.",
    tenantSlugLabel: "Идентификатор тенанта",
    adminEmailLabel: "Email админа",
    goToLogin: "Перейти на страницу входа тенанта",
    createAnother: "Создать ещё один тенант",
    genericError: "Произошла ошибка, попробуйте снова",
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

export function PlatformCreateTenantView() {
  const { lang } = useLang();
  const t = content[lang];
  const navigate = useNavigate();
  const { status, totpEnabled, accessToken } = usePlatformAuth();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [tenant, setTenant] = useState<Tenant | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [reason, setReason] = useState("");
  const [adminEmail, setAdminEmail] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "anonymous") navigate("/platform/login", { replace: true });
    else if (status === "authenticated" && !totpEnabled) navigate("/platform/2fa-setup", { replace: true });
  }, [status, totpEnabled, navigate]);

  if (status !== "authenticated" || !totpEnabled || !accessToken) return null;

  const slugValid = /^[a-z0-9-]+$/.test(slug) && slug.length > 0;
  const canSubmitStep1 = name.trim().length > 0 && slugValid;
  const canSubmitStep2 = email.length > 0 && password.length > 0 && reason.trim().length >= 3;

  async function handleCreateTenant() {
    setError(null);
    setLoading(true);
    try {
      const created = await platformTenantsApi.createTenant(accessToken!, { name: name.trim(), slug });
      setTenant(created);
      setStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.genericError);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAdmin() {
    if (!tenant) return;
    setError(null);
    setLoading(true);
    try {
      const admin = await platformTenantsApi.createTenantAdminUser(accessToken!, tenant.id, {
        email,
        password,
        reason: reason.trim(),
      });
      setAdminEmail(admin.email);
      setStep(3);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.genericError);
    } finally {
      setLoading(false);
    }
  }

  function resetWizard() {
    setStep(1);
    setName("");
    setSlug("");
    setSlugTouched(false);
    setTenant(null);
    setEmail("");
    setPassword("");
    setReason("");
    setAdminEmail("");
    setError(null);
  }

  if (step === 3) {
    return (
      <AuthCard maxWidth="480px" className="text-center">
        <div className="border-success/25 bg-success/12 mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border">
          <CheckCircle2 size={28} className="text-success" />
        </div>
        <h2 className="font-heading mb-2 text-2xl font-extrabold text-foreground">{t.successTitle}</h2>
        <p className="mb-7 text-sm text-foreground-muted">{t.successDesc}</p>

        <div className="bg-background/60 border-card-border mb-7 rounded-2xl border p-5 text-left">
          <div className="mb-3 flex justify-between text-sm">
            <span className="text-foreground-muted">{t.tenantSlugLabel}</span>
            <span className="font-mono font-semibold text-foreground">{tenant?.slug}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-foreground-muted">{t.adminEmailLabel}</span>
            <span className="font-semibold text-foreground">{adminEmail}</span>
          </div>
        </div>

        <Button variant="gold" size="lg" className="mb-3 w-full" asChild>
          <Link to="/login">{t.goToLogin}</Link>
        </Button>
        <Button variant="outline" size="lg" className="w-full" onClick={resetWizard}>
          {t.createAnother}
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard maxWidth="480px">
      {step === 1 ? (
        <>
          <div className="border-primary/25 bg-primary/12 mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl border">
            <Building2 size={24} className="text-primary" />
          </div>
          <h2 className="font-heading mb-1 text-center text-2xl font-extrabold text-foreground">{t.step1Title}</h2>
          <p className="mb-7 text-center text-sm text-foreground-muted">{t.step1Sub}</p>

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

          {error && <p className="text-destructive mb-4 text-[13px] font-medium">{error}</p>}

          <Button variant="gold" size="lg" className="w-full" disabled={!canSubmitStep1 || loading} onClick={handleCreateTenant}>
            {loading && <Loader2 size={16} className="animate-spin" />}
            {t.next}
          </Button>
        </>
      ) : (
        <>
          <div className="border-secondary/25 bg-secondary/12 mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl border">
            <UserPlus size={24} className="text-secondary" />
          </div>
          <h2 className="font-heading mb-1 text-center text-2xl font-extrabold text-foreground">{t.step2Title}</h2>
          <p className="mb-1 text-center text-sm text-foreground-muted">{t.step2Sub}</p>
          <p className="font-mono mb-6 text-center text-xs text-foreground-muted">{tenant?.slug}</p>

          <FormField label={t.email} type="email" placeholder="admin@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
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
            <FormField label={t.reason} placeholder={t.reasonPlaceholder} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>

          {error && <p className="text-destructive mb-4 text-[13px] font-medium">{error}</p>}

          <Button variant="gold" size="lg" className="w-full" disabled={!canSubmitStep2 || loading} onClick={handleCreateAdmin}>
            {loading && <Loader2 size={16} className="animate-spin" />}
            {t.create}
          </Button>
        </>
      )}
    </AuthCard>
  );
}
