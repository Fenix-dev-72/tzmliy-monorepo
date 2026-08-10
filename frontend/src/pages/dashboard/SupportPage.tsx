import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LifeBuoy, Loader2 } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as complaintsApi from "@/lib/api/complaints";
import type { Complaint } from "@/lib/api/complaints";
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
    historyTitle: "Mening so'rovlarim",
    statusOpen: "Yangi",
    statusInProgress: "Ko'rib chiqilmoqda",
    statusResolved: "Hal qilindi",
    adminReply: "Admin javobi:",
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
    historyTitle: "Мои обращения",
    statusOpen: "Новое",
    statusInProgress: "На рассмотрении",
    statusResolved: "Решено",
    adminReply: "Ответ администратора:",
  },
};

const statusBadgeClass: Record<Complaint["status"], string> = {
  open: "bg-primary/12 text-primary",
  in_progress: "bg-accent-orange/12 text-accent-orange",
  resolved: "bg-success/12 text-success",
};

export function SupportPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken } = useTenantAuth();

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [myComplaints, setMyComplaints] = useState<Complaint[]>([]);

  async function loadMyComplaints() {
    if (!accessToken) return;
    try {
      setMyComplaints(await complaintsApi.listMyComplaints(accessToken));
    } catch {
      // Non-critical -- the compose form still works without history loaded.
    }
  }

  useEffect(() => {
    void loadMyComplaints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function handleSend() {
    if (!accessToken || subject.trim().length < 3 || message.trim().length < 3) return;
    setSending(true);
    try {
      await complaintsApi.createComplaint(accessToken, { subject: subject.trim(), message: message.trim() });
      toast.success(t.sent);
      setSubject("");
      setMessage("");
      void loadMyComplaints();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : t.genericError);
    } finally {
      setSending(false);
    }
  }

  const statusLabel = {
    open: t.statusOpen,
    in_progress: t.statusInProgress,
    resolved: t.statusResolved,
  } as const;

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

      {myComplaints.length > 0 && (
        <div className="mt-8">
          <h2 className="font-heading mb-3 text-base font-bold text-foreground">{t.historyTitle}</h2>
          <div className="flex flex-col gap-3">
            {myComplaints.map((c) => (
              <div key={c.id} className="glass-card p-4 sm:p-5">
                <div className="mb-1.5 flex items-start justify-between gap-3">
                  <span className="text-sm font-semibold text-foreground">{c.subject}</span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass[c.status]}`}
                  >
                    {statusLabel[c.status]}
                  </span>
                </div>
                <p className="text-sm text-foreground-muted">{c.message}</p>
                {c.admin_reply && (
                  <div className="border-card-border mt-3 rounded-lg border-l-2 border-l-primary bg-accent/40 p-3">
                    <p className="text-primary mb-1 text-xs font-semibold">{t.adminReply}</p>
                    <p className="text-sm text-foreground">{c.admin_reply}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
