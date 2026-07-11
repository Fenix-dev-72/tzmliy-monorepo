import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Loader2, Send } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as notificationsApi from "@/lib/api/notifications";
import type { DeliveryLogEntry, GroupMapping, OutboxMessage } from "@/lib/api/notifications";
import { ApiError } from "@/lib/api/client";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { IntegrationCard } from "@/components/shared/IntegrationCard";
import { StatusBadge } from "@/components/shared/StatusBadge";

const content = {
  uz: {
    title: "Bildirishnomalar",
    sub: "Telegram bot va guruh xabarlari",
    connect: "Ulash",
    connected: "Ulangan",
    save: "Saqlash",
    botToken: "Bot tokeni",
    need2fa: "Sozlash uchun 2FA yoqilgan bo'lishi kerak.",
    genericError: "Xatolik yuz berdi",
    connectedToast: "Bot ulandi",
    mappingsTitle: "Guruh bog'lanishlari",
    chatId: "Telegram chat ID",
    label: "Nom",
    addMapping: "Bog'lash",
    noMappings: "Hali bog'lanishlar yo'q",
    mappingSaved: "Bog'landi",
    sendTitle: "Xabar yuborish",
    messageText: "Xabar matni",
    send: "Yuborish",
    sent: "Yuborildi",
    telegramNotConfigured: "Avval Telegram botni ulang",
    noMappingFound: "Bu kategoriya uchun guruh bog'lanishi topilmadi",
    outboxTitle: "Chiquvchi xabarlar",
    noMessages: "Hali xabarlar yo'q",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    statusPending: "Kutilmoqda",
    statusSent: "Yuborilgan",
    statusFailed: "Xato",
    statusDeadLetter: "Bekor qilingan",
  },
  ru: {
    title: "Уведомления",
    sub: "Telegram бот и групповые сообщения",
    connect: "Подключить",
    connected: "Подключено",
    save: "Сохранить",
    botToken: "Токен бота",
    need2fa: "Для настройки требуется включённая 2FA.",
    genericError: "Произошла ошибка",
    connectedToast: "Бот подключён",
    mappingsTitle: "Привязки групп",
    chatId: "Telegram chat ID",
    label: "Название",
    addMapping: "Привязать",
    noMappings: "Привязок пока нет",
    mappingSaved: "Привязано",
    sendTitle: "Отправить сообщение",
    messageText: "Текст сообщения",
    send: "Отправить",
    sent: "Отправлено",
    telegramNotConfigured: "Сначала подключите Telegram бота",
    noMappingFound: "Привязка группы для этой категории не найдена",
    outboxTitle: "Исходящие сообщения",
    noMessages: "Сообщений пока нет",
    loadError: "Не удалось загрузить данные",
    statusPending: "Ожидает",
    statusSent: "Отправлено",
    statusFailed: "Ошибка",
    statusDeadLetter: "Отменено",
  },
};

export function NotificationsPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken, user } = useTenantAuth();
  const has2fa = Boolean(user?.totp_enabled);
  const canView = (user?.permissions ?? []).includes("notifications.view");
  const canManage = (user?.permissions ?? []).includes("notifications.manage");

  const [configured, setConfigured] = useState(false);
  const [mappings, setMappings] = useState<GroupMapping[]>([]);
  const [messages, setMessages] = useState<OutboxMessage[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deliveryLogs, setDeliveryLogs] = useState<Record<string, DeliveryLogEntry[]>>({});
  const [error, setError] = useState<string | null>(null);

  const [chatId, setChatId] = useState("");
  const [mappingLabel, setMappingLabel] = useState("");
  const [mappingSaving, setMappingSaving] = useState(false);

  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);

  const statusLabels: Record<string, string> = {
    pending: t.statusPending,
    sent: t.statusSent,
    failed: t.statusFailed,
    dead_letter: t.statusDeadLetter,
  };

  async function load() {
    if (!accessToken || !canView) return;
    setError(null);
    try {
      const [status, mappingsData, messagesData] = await Promise.all([
        notificationsApi.getTelegramStatus(accessToken),
        notificationsApi.listGroupMappings(accessToken),
        notificationsApi.listMessages(accessToken),
      ]);
      setConfigured(status.configured);
      setMappings(mappingsData);
      setMessages(messagesData);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.loadError);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function handleConnect(values: Record<string, string>) {
    if (!accessToken) return;
    try {
      await notificationsApi.configureTelegramBot(accessToken, values.bot_token);
      toast.success(t.connectedToast);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 403 ? t.need2fa : t.genericError);
    }
  }

  async function handleCreateMapping() {
    if (!accessToken || !chatId.trim() || !mappingLabel.trim()) return;
    setMappingSaving(true);
    try {
      await notificationsApi.createGroupMapping(accessToken, {
        telegram_chat_id: Number(chatId.trim()),
        label: mappingLabel.trim(),
      });
      toast.success(t.mappingSaved);
      setChatId("");
      setMappingLabel("");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 403 ? t.need2fa : t.genericError);
    } finally {
      setMappingSaving(false);
    }
  }

  async function handleSend() {
    if (!accessToken || !messageText.trim()) return;
    setSending(true);
    try {
      await notificationsApi.sendMessage(accessToken, { text: messageText.trim() });
      toast.success(t.sent);
      setMessageText("");
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.detail.toLowerCase().includes("not configured")) {
        toast.error(t.telegramNotConfigured);
      } else if (err instanceof ApiError && err.status === 404) {
        toast.error(t.noMappingFound);
      } else {
        toast.error(t.genericError);
      }
    } finally {
      setSending(false);
    }
  }

  async function handleExpand(msg: OutboxMessage) {
    if (expandedId === msg.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(msg.id);
    if (!accessToken || msg.id in deliveryLogs) return;
    try {
      const logs = await notificationsApi.listDeliveryLog(accessToken, msg.id);
      setDeliveryLogs((prev) => ({ ...prev, [msg.id]: logs }));
    } catch {
      setDeliveryLogs((prev) => ({ ...prev, [msg.id]: [] }));
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <h1 className="font-heading mb-1 text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
        <p className="text-sm text-foreground-muted">{t.sub}</p>
      </div>

      {!has2fa && canManage && (
        <div className="border-primary/25 bg-primary/8 mb-6 flex items-center gap-3 rounded-2xl border p-4">
          <span className="flex-1 text-sm text-foreground">{t.need2fa}</span>
        </div>
      )}

      <div className="mb-6 max-w-md">
        <IntegrationCard
          icon={Send}
          brandColor="#4C6FFF"
          name="Telegram"
          connected={configured}
          connectLabel={t.connect}
          connectedLabel={t.connected}
          submitLabel={t.save}
          fields={[{ key: "bot_token", label: t.botToken, secret: true }]}
          onSubmit={handleConnect}
        />
      </div>

      {error && (
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center">
          <AlertCircle size={28} className="text-destructive" />
          <p className="text-sm text-foreground-muted">{error}</p>
        </div>
      )}

      {!error && canView && (
        <>
          <div className="glass-card mb-6 p-5 sm:p-6">
            <h2 className="mb-4 text-sm font-bold text-foreground">{t.mappingsTitle}</h2>
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField label={t.chatId} value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="-1001234567890" className="mb-0" />
              <FormField label={t.label} value={mappingLabel} onChange={(e) => setMappingLabel(e.target.value)} placeholder="Sotuvlar guruhi" className="mb-0" />
              <Button
                variant="gold"
                size="sm"
                disabled={!chatId.trim() || !mappingLabel.trim() || mappingSaving}
                onClick={handleCreateMapping}
                className="h-11 self-end"
              >
                {mappingSaving && <Loader2 size={14} className="animate-spin" />}
                {t.addMapping}
              </Button>
            </div>
            {mappings.length === 0 ? (
              <p className="text-xs text-foreground-muted">{t.noMappings}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {mappings.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{m.label}</span>
                    <span className="font-mono text-xs text-foreground-muted">{m.telegram_chat_id}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {canManage && (
            <div className="glass-card mb-6 p-5 sm:p-6">
              <h2 className="mb-4 text-sm font-bold text-foreground">{t.sendTitle}</h2>
              <FormField label={t.messageText} value={messageText} onChange={(e) => setMessageText(e.target.value)} />
              <Button variant="gold" size="sm" disabled={!messageText.trim() || sending} onClick={handleSend}>
                {sending && <Loader2 size={14} className="animate-spin" />}
                {t.send}
              </Button>
            </div>
          )}

          <h2 className="font-heading mb-3 text-base font-bold text-foreground">{t.outboxTitle}</h2>
          {messages === null ? (
            <div className="flex justify-center py-12">
              <Loader2 size={24} className="text-primary animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <p className="glass-card py-10 text-center text-sm text-foreground-muted">{t.noMessages}</p>
          ) : (
            <div className="glass-card overflow-hidden p-0">
              {messages.map((msg, i) => (
                <div key={msg.id} className={i < messages.length - 1 ? "border-b border-card-border/60" : ""}>
                  <button
                    onClick={() => handleExpand(msg)}
                    className="hover:bg-accent/40 flex w-full items-center justify-between gap-3 p-4 text-left transition-colors"
                  >
                    <span className="truncate text-sm text-foreground">
                      {msg.text_body ?? msg.document_filename ?? "—"}
                    </span>
                    <StatusBadge status={msg.status} label={statusLabels[msg.status] ?? msg.status} />
                  </button>
                  {expandedId === msg.id && (
                    <div className="bg-background/40 px-4 pb-4">
                      {(deliveryLogs[msg.id] ?? []).length === 0 ? (
                        <Loader2 size={14} className="text-primary animate-spin" />
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {deliveryLogs[msg.id].map((log) => (
                            <div key={log.id} className="flex items-center justify-between text-xs">
                              <span className="text-foreground-muted">
                                #{log.attempt_number} · {new Date(log.attempted_at).toLocaleString()}
                              </span>
                              <span className={log.status === "success" ? "text-success" : "text-destructive"}>
                                {log.error ?? log.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
