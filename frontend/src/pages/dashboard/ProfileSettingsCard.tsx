import { useState } from "react";
import { toast } from "sonner";
import { Loader2, User } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as usersApi from "@/lib/api/users";
import { ApiError } from "@/lib/api/client";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    title: "Profil",
    name: "Ism",
    namePlaceholder: "To'liq ismingiz",
    phone: "Telefon raqam",
    phonePlaceholder: "+998901234567",
    submit: "Saqlash",
    success: "Profil yangilandi",
    phoneTaken: "Bu telefon raqam allaqachon band",
    genericError: "Xatolik yuz berdi",
  },
  ru: {
    title: "Профиль",
    name: "Имя",
    namePlaceholder: "Ваше полное имя",
    phone: "Номер телефона",
    phonePlaceholder: "+998901234567",
    submit: "Сохранить",
    success: "Профиль обновлён",
    phoneTaken: "Этот номер уже используется",
    genericError: "Произошла ошибка",
  },
};

export function ProfileSettingsCard() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken, user, refetchUser } = useTenantAuth();

  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!accessToken) return;
    setError(null);
    setSaving(true);
    try {
      await usersApi.updateOwnProfile(accessToken, { full_name: fullName || null, phone: phone || null });
      await refetchUser();
      toast.success(t.success);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError(t.phoneTaken);
      else setError(err instanceof ApiError ? err.detail : t.genericError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass-card p-6 sm:p-8">
      <div className="mb-5 flex items-center gap-2">
        <User size={18} className="text-primary" />
        <h2 className="font-heading text-base font-bold text-foreground">{t.title}</h2>
      </div>

      <FormField label={t.name} placeholder={t.namePlaceholder} value={fullName} onChange={(e) => setFullName(e.target.value)} />
      <FormField label={t.phone} placeholder={t.phonePlaceholder} value={phone} onChange={(e) => setPhone(e.target.value)} />

      {error && <p className="text-destructive mb-4 text-[13px] font-medium">{error}</p>}

      <Button variant="gold" disabled={saving} onClick={handleSubmit}>
        {saving && <Loader2 size={16} className="animate-spin" />}
        {t.submit}
      </Button>
    </div>
  );
}
