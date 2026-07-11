import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as tenantAuthApi from "@/lib/api/tenantAuth";
import { ApiError } from "@/lib/api/client";
import { FormField } from "@/components/auth/FormField";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    title: "Parolni almashtirish",
    current: "Joriy parol",
    next: "Yangi parol",
    confirm: "Yangi parolni takrorlang",
    submit: "Almashtirish",
    wrongCurrent: "Joriy parol noto'g'ri",
    mismatch: "Parollar mos kelmadi",
    genericError: "Xatolik yuz berdi",
    success: "Parol almashtirildi, qayta kiring",
  },
  ru: {
    title: "Смена пароля",
    current: "Текущий пароль",
    next: "Новый пароль",
    confirm: "Повторите новый пароль",
    submit: "Сменить",
    wrongCurrent: "Текущий пароль неверен",
    mismatch: "Пароли не совпадают",
    genericError: "Произошла ошибка",
    success: "Пароль изменён, войдите заново",
  },
};

export function PasswordChangeCard() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken, logout } = useTenantAuth();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSubmit = current.length > 0 && next.length >= 8 && confirmPw.length > 0;

  async function handleSubmit() {
    if (!accessToken) return;
    if (next !== confirmPw) {
      setError(t.mismatch);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await tenantAuthApi.changePassword(accessToken, { current_password: current, new_password: next });
      toast.success(t.success);
      await logout();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError(t.wrongCurrent);
      else setError(t.genericError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass-card p-6 sm:p-8">
      <div className="mb-5 flex items-center gap-2">
        <KeyRound size={18} className="text-primary" />
        <h2 className="font-heading text-base font-bold text-foreground">{t.title}</h2>
      </div>

      <FormField
        label={t.current}
        type={showCurrent ? "text" : "password"}
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        autoComplete="current-password"
        rightEl={
          <button type="button" onClick={() => setShowCurrent((s) => !s)} className="text-foreground-muted">
            {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        }
      />
      <div>
        <FormField
          label={t.next}
          type={showNext ? "text" : "password"}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          rightEl={
            <button type="button" onClick={() => setShowNext((s) => !s)} className="text-foreground-muted">
              {showNext ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
        />
        <PasswordStrengthMeter password={next} />
      </div>
      <FormField
        label={t.confirm}
        type={showNext ? "text" : "password"}
        value={confirmPw}
        onChange={(e) => setConfirmPw(e.target.value)}
        autoComplete="new-password"
      />

      {error && <p className="text-destructive mb-4 text-[13px] font-medium">{error}</p>}

      <Button variant="gold" disabled={!canSubmit || saving} onClick={handleSubmit}>
        {saving && <Loader2 size={16} className="animate-spin" />}
        {t.submit}
      </Button>
    </div>
  );
}
