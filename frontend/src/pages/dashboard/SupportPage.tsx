import { useState } from "react";
import { toast } from "sonner";
import { LifeBuoy, Loader2 } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as complaintsApi from "@/lib/api/complaints";
import { ApiError } from "@/lib/api/client";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    title: "Yordam so'rash",
    sub: "Muammo yoki savolingiz bo'lsa, bizga xabar bering — Tizimly jamoasi ko'rib chiqadi.",
    subject: "Mavzu",
    subjectPlaceholder: "Muammoni qisqacha ta'riflang",
    message: "Xabar",
    messagePlaceholder: "Muammoni batafsil yozing...",
    send: "Yuborish",
    sent: "Xabaringiz yuborildi, tez orada javob beramiz",
    genericError: "Xatolik yuz berdi",
  },
  ru: {
    title: "Обратиться за помощью",
    sub: "Если у вас проблема или вопрос, напишите нам — команда Tizimly рассмотрит обращение.",
    subject: "Тема",
    subjectPlaceholder: "Кратко опишите проблему",
    message: "Сообщение",
    messagePlaceholder: "Опишите проблему подробнее...",
    send: "Отправить",
    sent: "Ваше сообщение отправлено, скоро ответим",
    genericError: "Произошла ошибка",
  },
};

export function SupportPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken } = useTenantAuth();

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!accessToken || subject.trim().length < 3 || message.trim().length < 3) return;
    setSending(true);
    try {
      await complaintsApi.createComplaint(accessToken, { subject: subject.trim(), message: message.trim() });
      toast.success(t.sent);
      setSubject("");
      setMessage("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : t.genericError);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center gap-2.5">
        <LifeBuoy size={22} className="text-primary" />
        <div>
          <h1 className="font-heading text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
          <p className="text-sm text-foreground-muted">{t.sub}</p>
        </div>
      </div>

      <div className="glass-card p-5 sm:p-6">
        <FormField label={t.subject} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t.subjectPlaceholder} />
        <label className="text-foreground mb-1.5 block text-sm font-medium">{t.message}</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t.messagePlaceholder}
          rows={6}
          className="border-card-border bg-input-background text-foreground mb-4 w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
        />
        <Button
          variant="gold"
          disabled={sending || subject.trim().length < 3 || message.trim().length < 3}
          onClick={handleSend}
        >
          {sending && <Loader2 size={16} className="animate-spin" />}
          {t.send}
        </Button>
      </div>
    </main>
  );
}
