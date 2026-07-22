import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Clock, MessageSquareWarning } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { usePlatformAuth } from "@/lib/auth/platformAuthStore";
import * as complaintsApi from "@/lib/api/complaints";
import type { Complaint, ComplaintStatus } from "@/lib/api/complaints";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    title: "Shikoyatlar",
    sub: "Tenant xodimlaridan kelgan yordam so'rovlari",
    empty: "Hozircha shikoyatlar yo'q",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    markInProgress: "Jarayonga olish",
    markResolved: "Hal qilindi",
    statuses: { open: "Ochiq", in_progress: "Jarayonda", resolved: "Hal qilindi" } as Record<ComplaintStatus, string>,
    updated: "Holat yangilandi",
    genericError: "Xatolik yuz berdi",
  },
  ru: {
    title: "Жалобы",
    sub: "Запросы о помощи от сотрудников тенантов",
    empty: "Жалоб пока нет",
    loadError: "Не удалось загрузить данные",
    markInProgress: "Взять в работу",
    markResolved: "Решено",
    statuses: { open: "Открыта", in_progress: "В работе", resolved: "Решена" } as Record<ComplaintStatus, string>,
    updated: "Статус обновлён",
    genericError: "Произошла ошибка",
  },
};

const STATUS_COLOR: Record<ComplaintStatus, string> = {
  open: "#EF4444",
  in_progress: "#F59E0B",
  resolved: "#10B981",
};

export function PlatformComplaintsPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken } = usePlatformAuth();

  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function load() {
    if (!accessToken) return;
    try {
      setComplaints(await complaintsApi.listComplaints(accessToken));
    } catch {
      setError(t.loadError);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function handleUpdate(id: string, status: ComplaintStatus) {
    if (!accessToken) return;
    setUpdatingId(id);
    try {
      await complaintsApi.updateComplaintStatus(accessToken, id, status);
      toast.success(t.updated);
      await load();
    } catch {
      toast.error(t.genericError);
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="mb-6 flex items-center gap-2.5">
        <MessageSquareWarning size={22} className="text-primary" />
        <div>
          <h1 className="font-heading text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
          <p className="text-sm text-foreground-muted">{t.sub}</p>
        </div>
      </div>

      {error && <div className="glass-card p-6 text-center text-sm text-foreground-muted">{error}</div>}

      {!error && complaints === null && <div className="bg-accent/60 h-32 animate-pulse rounded-xl" />}

      {!error && complaints !== null && complaints.length === 0 && (
        <p className="glass-card py-10 text-center text-sm text-foreground-muted">{t.empty}</p>
      )}

      {!error && complaints !== null && complaints.length > 0 && (
        <div className="space-y-3">
          {complaints.map((c) => {
            const color = STATUS_COLOR[c.status];
            return (
              <div key={c.id} className="glass-card p-4 sm:p-5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">{c.subject}</span>
                  <span
                    className="rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap"
                    style={{ background: `${color}15`, borderColor: `${color}30`, color }}
                  >
                    {t.statuses[c.status]}
                  </span>
                </div>
                <p className="text-foreground-muted mb-3 text-sm whitespace-pre-wrap">{c.message}</p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-foreground-muted text-xs">{new Date(c.created_at).toLocaleString()}</span>
                  {c.status !== "resolved" && (
                    <div className="flex gap-2">
                      {c.status === "open" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={updatingId === c.id}
                          onClick={() => handleUpdate(c.id, "in_progress")}
                        >
                          <Clock size={13} />
                          {t.markInProgress}
                        </Button>
                      )}
                      <Button variant="gold" size="sm" disabled={updatingId === c.id} onClick={() => handleUpdate(c.id, "resolved")}>
                        <CheckCircle2 size={13} />
                        {t.markResolved}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
