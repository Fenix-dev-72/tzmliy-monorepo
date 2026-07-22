import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import * as tenantAuthApi from "@/lib/api/tenantAuth";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    title: "Parolni tiklash",
    sub: "Email yoki telefon raqamingizni kiriting",
    identifier: "Email yoki telefon raqami",
    btn: "Tiklash havolasini yuborish",
    back: "Orqaga",
    sentTitle: "Havola yuborildi",
    sentDesc: "Agar bu email/telefon ro'yxatdan o'tgan bo'lsa, parolni tiklash havolasi yuborildi.",
  },
  ru: {
    title: "Восстановление пароля",
    sub: "Введите ваш email или номер телефона",
    identifier: "Email или номер телефона",
    btn: "Отправить ссылку для сброса",
    back: "Назад",
    sentTitle: "Ссылка отправлена",
    sentDesc: "Если этот email/телефон зарегистрирован, ссылка для сброса пароля отправлена.",
  },
};

export function ForgotPasswordView() {
  const { lang } = useLang();
  const t = content[lang];
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const canSubmit = identifier.trim().length > 0;

  async function handleSubmit() {
    setLoading(true);
    try {
      await tenantAuthApi.requestPasswordReset({ identifier: identifier.trim() });
    } finally {
      // backend always returns 204 regardless of whether the identifier exists (anti-enumeration)
      setLoading(false);
      setSent(true);
    }
  }

  if (sent) {
    return (
      <AuthCard className="text-center">
        <div className="border-success/25 bg-success/12 mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border">
          <MailCheck size={28} className="text-success" />
        </div>
        <h2 className="font-display mb-2 text-[26px] font-bold text-foreground">{t.sentTitle}</h2>
        <p className="mb-8 text-sm leading-relaxed text-foreground-muted">{t.sentDesc}</p>
        <button
          onClick={() => navigate("/login")}
          className="mx-auto flex items-center justify-center gap-1.5 text-[13px] font-medium text-foreground-muted"
        >
          <ArrowLeft size={14} /> {t.back}
        </button>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <button
        onClick={() => navigate("/login")}
        className="mb-6 flex items-center gap-1.5 text-[13px] font-medium text-foreground-muted"
      >
        <ArrowLeft size={14} /> {t.back}
      </button>
      <h2 className="font-display mb-2 text-[26px] font-bold text-foreground">{t.title}</h2>
      <p className="mb-7 text-sm text-foreground-muted">{t.sub}</p>

      <FormField
        label={t.identifier}
        type="text"
        placeholder="email@company.com / +998 90 123 45 67"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
      />

      <Button variant="gold" size="lg" className="mt-2 w-full" disabled={!canSubmit || loading} onClick={handleSubmit}>
        {loading && <Loader2 size={16} className="animate-spin" />}
        {t.btn}
      </Button>
    </AuthCard>
  );
}
