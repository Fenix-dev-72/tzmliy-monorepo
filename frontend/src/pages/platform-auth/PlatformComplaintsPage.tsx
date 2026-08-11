import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, MessageSquareWarning, ServerCrash } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { usePlatformAuth } from "@/lib/auth/platformAuthStore";
import * as complaintsApi from "@/lib/api/complaints";
import type { Complaint, ComplaintStatus } from "@/lib/api/complaints";
import * as platformDashboardApi from "@/lib/api/platformDashboard";
import type { SystemIssue, SystemIssueSource } from "@/lib/api/platformDashboard";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    title: "Shikoyatlar",
    sub: "Tenant xodimlaridan kelgan yordam so'rovlari",
    tabUsers: "Foydalanuvchi shikoyatlari",
    tabSystem: "Server muammolari",
    empty: "Hozircha shikoyatlar yo'q",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    markInProgress: "Jarayonga olish",
    markResolved: "Hal qilindi",
    statuses: { open: "Ochiq", in_progress: "Jarayonda", resolved: "Hal qilindi" } as Record<ComplaintStatus, string>,
    updated: "Holat yangilandi",
    genericError: "Xatolik yuz berdi",
    replyLabel: "Javob",
    replyPlaceholder: "Javobingizni yozing...",
    sendReply: "Javob yuborish",
    replySent: "Javob yuborildi",
    yourReply: "Sizning javobingiz:",
    issuesSub: "Tizim o'zi aniqlagan muammolar (yetkazilmagan xabarlar, muvaffaqiyatsiz hisobotlar/hisob-kitoblar, backup)",
    issuesEmpty: "Hozircha server muammolari yo'q",
    platformLevel: "Platforma darajasida",
    sources: {
      notification: "Bildirishnoma",
      report_export: "Hisobot eksporti",
      payroll: "Bonus/maosh",
      backup: "Backup",
    } as Record<SystemIssueSource, string>,
  },
  ru: {
    title: "Жалобы",
    sub: "Запросы о помощи от сотрудников тенантов",
    tabUsers: "Жалобы пользователей",
    tabSystem: "Проблемы сервера",
    empty: "Жалоб пока нет",
    loadError: "Не удалось загрузить данные",
    markInProgress: "Взять в работу",
    markResolved: "Решено",
    statuses: { open: "Открыта", in_progress: "В работе", resolved: "Решена" } as Record<ComplaintStatus, string>,
    updated: "Статус обновлён",
    genericError: "Произошла ошибка",
    replyLabel: "Ответ",
    replyPlaceholder: "Напишите ответ...",
    sendReply: "Отправить ответ",
    replySent: "Ответ отправлен",
    yourReply: "Ваш ответ:",
    issuesSub: "Проблемы, которые система обнаружила сама (недоставленные сообщения, неудачные отчёты/расчёты, бэкап)",
    issuesEmpty: "Проблем сервера пока нет",
    platformLevel: "Уровень платформы",
    sources: {
      notification: "Уведомление",
      report_export: "Экспорт отчёта",
      payroll: "Бонус/зарплата",
      backup: "Бэкап",
    } as Record<SystemIssueSource, string>,
  },
};

const STATUS_COLOR: Record<ComplaintStatus, string> = {
  open: "#EF4444",
  in_progress: "#F59E0B",
  resolved: "#10B981",
};

const SOURCE_ICON: Record<SystemIssueSource, typeof ServerCrash> = {
  notification: AlertTriangle,
  report_export: AlertTriangle,
  payroll: AlertTriangle,
  backup: ServerCrash,
};

export function PlatformComplaintsPage() {
  const { lang } = useLang();
  const t = content[lang];
  const [tab, setTab] = useState<"users" | "system">("users");

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="mb-6 flex items-center gap-2.5">
        <MessageSquareWarning size={22} className="text-primary" />
        <div>
          <h1 className="font-heading text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
          <p className="text-sm text-foreground-muted">{t.sub}</p>
        </div>
      </div>

      <div className="border-card-border mb-6 flex gap-1 border-b">
        <button
          type="button"
          onClick={() => setTab("users")}
          className={`border-b-2 px-3 pb-2.5 text-sm font-semibold transition-colors ${
            tab === "users" ? "border-primary text-primary" : "border-transparent text-foreground-muted hover:text-foreground"
          }`}
        >
          {t.tabUsers}
        </button>
        <button
          type="button"
          onClick={() => setTab("system")}
          className={`border-b-2 px-3 pb-2.5 text-sm font-semibold transition-colors ${
            tab === "system" ? "border-primary text-primary" : "border-transparent text-foreground-muted hover:text-foreground"
          }`}
        >
          {t.tabSystem}
        </button>
      </div>

      {tab === "users" ? <UserComplaintsTab /> : <SystemIssuesTab />}
    </main>
  );
}

function UserComplaintsTab() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken } = usePlatformAuth();

  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyingId, setReplyingId] = useState<string | null>(null);

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

  async function handleReply(id: string) {
    const message = (replyDrafts[id] ?? "").trim();
    if (!accessToken || message.length === 0) return;
    setReplyingId(id);
    try {
      await complaintsApi.replyToComplaint(accessToken, id, message);
      toast.success(t.replySent);
      setReplyDrafts((prev) => ({ ...prev, [id]: "" }));
      await load();
    } catch {
      toast.error(t.genericError);
    } finally {
      setReplyingId(null);
    }
  }

  return (
    <>
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

                {c.admin_reply && (
                  <div className="border-card-border mb-3 rounded-lg border-l-2 border-l-primary bg-accent/40 p-3">
                    <p className="text-primary mb-1 text-xs font-semibold">{t.yourReply}</p>
                    <p className="text-foreground text-sm whitespace-pre-wrap">{c.admin_reply}</p>
                  </div>
                )}

                <div className="mb-3">
                  <textarea
                    value={replyDrafts[c.id] ?? ""}
                    onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    placeholder={c.admin_reply ? t.replyPlaceholder : `${t.replyLabel}: ${t.replyPlaceholder}`}
                    rows={2}
                    className="border-card-border bg-input-background text-foreground w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-foreground-muted text-xs">{new Date(c.created_at).toLocaleString()}</span>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={replyingId === c.id || (replyDrafts[c.id] ?? "").trim().length === 0}
                      onClick={() => handleReply(c.id)}
                    >
                      {t.sendReply}
                    </Button>
                    {c.status !== "resolved" && (
                      <>
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
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function SystemIssuesTab() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken } = usePlatformAuth();

  const [issues, setIssues] = useState<SystemIssue[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    platformDashboardApi
      .getSystemIssues(accessToken)
      .then(setIssues)
      .catch(() => setError(t.loadError));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  return (
    <>
      <p className="text-foreground-muted mb-4 text-sm">{t.issuesSub}</p>

      {error && <div className="glass-card p-6 text-center text-sm text-foreground-muted">{error}</div>}

      {!error && issues === null && <div className="bg-accent/60 h-32 animate-pulse rounded-xl" />}

      {!error && issues !== null && issues.length === 0 && (
        <p className="glass-card py-10 text-center text-sm text-foreground-muted">{t.issuesEmpty}</p>
      )}

      {!error && issues !== null && issues.length > 0 && (
        <div className="space-y-3">
          {issues.map((issue) => {
            const Icon = SOURCE_ICON[issue.source];
            return (
              <div key={issue.id} className="glass-card p-4 sm:p-5">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <Icon size={17} className="text-destructive mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-foreground">{issue.title}</p>
                      <p className="text-foreground-muted text-xs">
                        {issue.tenant_name ?? t.platformLevel}
                      </p>
                    </div>
                  </div>
                  <span className="border-destructive/30 bg-destructive/10 text-destructive shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap">
                    {t.sources[issue.source]}
                  </span>
                </div>
                {issue.detail && (
                  <p className="border-card-border bg-accent/40 mb-2 rounded-lg border p-3 text-sm whitespace-pre-wrap text-foreground-muted">
                    {issue.detail}
                  </p>
                )}
                {issue.occurred_at && (
                  <span className="text-foreground-muted text-xs">{new Date(issue.occurred_at).toLocaleString()}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
