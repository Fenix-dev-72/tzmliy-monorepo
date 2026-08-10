import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { CheckCircle2, DatabaseBackup, ExternalLink, Loader2, PlayCircle, XCircle } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { usePlatformAuth } from "@/lib/auth/platformAuthStore";
import { ApiError } from "@/lib/api/client";
import * as platformBackupApi from "@/lib/api/platformBackup";
import type { BackupSettingsStatus } from "@/lib/api/platformBackup";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    title: "Backup sozlamalari",
    sub: "Kunlik ma'lumotlar bazasi zaxira nusxasi Telegram guruhiga avtomatik yuboriladi (har kuni soat 03:00da).",
    statusConfigured: "To'liq sozlangan",
    statusBotOnly: "Bot ulangan, guruh hali tanlanmagan",
    statusNotConfigured: "Sozlanmagan",
    lastBackup: "Oxirgi backup",
    never: "Hali bo'lmagan",
    lastStatus: { success: "Muvaffaqiyatli", failed: "Muvaffaqiyatsiz" } as Record<string, string>,
    step1Title: "1-qadam: Bot tokenini kiriting",
    step1Sub: "@BotFather orqali yangi bot yarating (/newbot) va tokenini shu yerga kiriting.",
    botToken: "Telegram bot tokeni",
    botTokenPlaceholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
    reason: "Sabab (audit uchun, kamida 3 belgi)",
    reasonPlaceholder: "Masalan: Backup botini birinchi marta sozlash",
    saveToken: "Tokenni saqlash",
    step2Title: "2-qadam: Guruhga ulash",
    step2Sub: "Tugmani bosing — Telegram o'zi guruh tanlashni so'raydi, botni shu guruhga qo'shsangiz bo'ldi. Kanal ID'sini qo'lda kiritish shart emas.",
    connectGroup: "Guruhga ulash",
    waitingForGroup: "Guruh tanlashingiz kutilmoqda...",
    linkExpired: "Havola muddati tugadi, qaytadan urinib ko'ring",
    runNow: "Hozir sinab ko'rish",
    running: "Ishga tushirilmoqda...",
    runQueued: "Navbatga qo'yildi — bir necha soniyadan so'ng holatni yangilang",
    need2fa: "Backup sozlash uchun avval hisobingizda 2FA yoqilgan bo'lishi kerak.",
    go2fa: "2FA sozlashga o'tish",
    genericError: "Xatolik yuz berdi, qayta urinib ko'ring",
    invalidToken: "Bot token noto'g'ri yoki ishlamayapti",
    reconnectBot: "Boshqa botga almashtirish",
  },
  ru: {
    title: "Настройки резервного копирования",
    sub: "Ежедневная резервная копия базы данных автоматически отправляется в Telegram-группу (каждый день в 03:00).",
    statusConfigured: "Полностью настроено",
    statusBotOnly: "Бот подключён, группа ещё не выбрана",
    statusNotConfigured: "Не настроено",
    lastBackup: "Последний бэкап",
    never: "Ещё не было",
    lastStatus: { success: "Успешно", failed: "Неудачно" } as Record<string, string>,
    step1Title: "Шаг 1: Введите токен бота",
    step1Sub: "Создайте нового бота через @BotFather (/newbot) и введите его токен здесь.",
    botToken: "Токен Telegram-бота",
    botTokenPlaceholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
    reason: "Причина (для аудита, минимум 3 символа)",
    reasonPlaceholder: "Например: Первичная настройка бота для бэкапов",
    saveToken: "Сохранить токен",
    step2Title: "Шаг 2: Подключите группу",
    step2Sub: "Нажмите кнопку — Telegram сам предложит выбрать группу, просто добавьте бота в неё. Вводить ID вручную не нужно.",
    connectGroup: "Подключить группу",
    waitingForGroup: "Ожидание выбора группы...",
    linkExpired: "Срок действия ссылки истёк, попробуйте снова",
    runNow: "Проверить сейчас",
    running: "Запускается...",
    runQueued: "Поставлено в очередь — обновите статус через несколько секунд",
    need2fa: "Для настройки бэкапа сначала нужно включить 2FA в аккаунте.",
    go2fa: "Перейти к настройке 2FA",
    genericError: "Произошла ошибка, попробуйте снова",
    invalidToken: "Токен бота неверен или не работает",
    reconnectBot: "Сменить бота",
  },
};

const POLL_INTERVAL_MS = 3000;

export function PlatformBackupSettingsView() {
  const { lang } = useLang();
  const t = content[lang];
  const navigate = useNavigate();
  const { status, totpEnabled, accessToken } = usePlatformAuth();

  const [settings, setSettings] = useState<BackupSettingsStatus | null>(null);
  const [botToken, setBotToken] = useState("");
  const [reason, setReason] = useState("");
  const [showReconfigure, setShowReconfigure] = useState(false);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const pollingRef = useRef(false);

  useEffect(() => {
    if (status === "anonymous") navigate("/platform/login", { replace: true });
  }, [status, navigate]);

  async function refreshStatus() {
    if (!accessToken) return;
    try {
      setSettings(await platformBackupApi.getBackupSettings(accessToken));
    } catch {
      setError(t.genericError);
    }
  }

  useEffect(() => {
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Poll while a group-link is pending -- Telegram delivers the confirming
  // message asynchronously once the admin actually picks a group, which
  // this page can't observe except by re-asking the status.
  useEffect(() => {
    if (!settings?.link_pending || pollingRef.current) return;
    pollingRef.current = true;
    const interval = setInterval(async () => {
      if (!accessToken) return;
      const fresh = await platformBackupApi.getBackupSettings(accessToken).catch(() => null);
      if (fresh && (fresh.configured || !fresh.link_pending)) {
        setSettings(fresh);
        clearInterval(interval);
        pollingRef.current = false;
      }
    }, POLL_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      pollingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.link_pending]);

  if (status !== "authenticated" || !accessToken) return null;

  const canSubmitToken = botToken.trim().length > 0 && reason.trim().length >= 3;

  async function handleSaveToken(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmitToken || loading) return;
    setError(null);
    setLoading(true);
    try {
      const result = await platformBackupApi.setBackupBotToken(accessToken!, {
        bot_token: botToken.trim(),
        reason: reason.trim(),
      });
      setSettings(result);
      setBotToken("");
      setReason("");
      setShowReconfigure(false);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 400 ? t.invalidToken : t.genericError);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnectGroup() {
    setError(null);
    setLinking(true);
    try {
      const link = await platformBackupApi.createBackupLinkToken(accessToken!);
      window.open(link.deep_link, "_blank", "noreferrer");
      await refreshStatus();
    } catch {
      setError(t.genericError);
    } finally {
      setLinking(false);
    }
  }

  async function handleRunNow() {
    setRunning(true);
    setRunMessage(null);
    try {
      await platformBackupApi.runBackupNow(accessToken!);
      setRunMessage(t.runQueued);
    } catch {
      setError(t.genericError);
    } finally {
      setRunning(false);
    }
  }

  if (!totpEnabled) {
    return (
      <main className="mx-auto max-w-[640px] px-4 py-8 sm:px-6 sm:py-10">
        <div className="glass-card p-6 text-center">
          <p className="text-foreground-muted mb-4 text-sm">{t.need2fa}</p>
          <Button variant="gold" size="lg" onClick={() => navigate("/platform/2fa-setup")}>
            {t.go2fa}
          </Button>
        </div>
      </main>
    );
  }

  const statusLabel = !settings
    ? ""
    : settings.configured
      ? t.statusConfigured
      : settings.bot_configured
        ? t.statusBotOnly
        : t.statusNotConfigured;

  return (
    <main className="mx-auto max-w-[640px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="border-primary/25 bg-primary/12 flex size-11 items-center justify-center rounded-2xl border">
          <DatabaseBackup size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="font-heading text-xl font-extrabold text-foreground">{t.title}</h1>
          <p className="text-foreground-muted text-sm">{t.sub}</p>
        </div>
      </div>

      {settings && (
        <div className="glass-card mb-6 flex items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            {settings.configured ? (
              <CheckCircle2 size={20} className="text-success shrink-0" />
            ) : (
              <XCircle size={20} className="text-destructive shrink-0" />
            )}
            <div>
              <p className="text-sm font-semibold text-foreground">{statusLabel}</p>
              <p className="text-foreground-muted text-xs">
                {t.lastBackup}:{" "}
                {settings.last_backup_at
                  ? `${new Date(settings.last_backup_at).toLocaleString()} — ${
                      settings.last_backup_status ? t.lastStatus[settings.last_backup_status] : ""
                    }`
                  : t.never}
              </p>
              {settings.last_backup_error && (
                <p className="text-destructive mt-1 text-xs">{settings.last_backup_error}</p>
              )}
            </div>
          </div>
          {settings.configured && (
            <Button variant="outline" size="sm" onClick={handleRunNow} disabled={running}>
              {running ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
              {t.runNow}
            </Button>
          )}
        </div>
      )}
      {runMessage && <p className="text-primary mb-4 text-[13px] font-medium">{runMessage}</p>}
      {error && <p className="text-destructive mb-4 text-[13px] font-medium">{error}</p>}

      {settings && !settings.bot_configured && (
        <form onSubmit={handleSaveToken} className="glass-card p-6">
          <h2 className="mb-1 text-sm font-bold text-foreground">{t.step1Title}</h2>
          <p className="text-foreground-muted mb-4 text-xs">{t.step1Sub}</p>
          <FormField label={t.botToken} placeholder={t.botTokenPlaceholder} value={botToken} onChange={(e) => setBotToken(e.target.value)} />
          <FormField label={t.reason} placeholder={t.reasonPlaceholder} value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button type="submit" variant="gold" size="lg" className="w-full" disabled={!canSubmitToken || loading}>
            {loading && <Loader2 size={16} className="animate-spin" />}
            {t.saveToken}
          </Button>
        </form>
      )}

      {settings && settings.bot_configured && !settings.configured && (
        <div className="glass-card p-6 text-center">
          <h2 className="mb-1 text-sm font-bold text-foreground">{t.step2Title}</h2>
          <p className="text-foreground-muted mx-auto mb-5 max-w-sm text-xs">{t.step2Sub}</p>
          <Button variant="gold" size="lg" className="w-full" onClick={handleConnectGroup} disabled={linking}>
            {linking ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
            {t.connectGroup}
          </Button>
          {settings.link_pending && (
            <p className="text-foreground-muted mt-4 flex items-center justify-center gap-2 text-xs">
              <Loader2 size={13} className="animate-spin" />
              {t.waitingForGroup}
            </p>
          )}
        </div>
      )}

      {settings && settings.configured && (
        <div className="text-center">
          {!showReconfigure ? (
            <button
              type="button"
              onClick={() => setShowReconfigure(true)}
              className="text-foreground-muted text-xs font-medium hover:text-foreground"
            >
              {t.reconnectBot}
            </button>
          ) : (
            <form onSubmit={handleSaveToken} className="glass-card mt-4 p-6 text-left">
              <h2 className="mb-1 text-sm font-bold text-foreground">{t.step1Title}</h2>
              <p className="text-foreground-muted mb-4 text-xs">{t.step1Sub}</p>
              <FormField label={t.botToken} placeholder={t.botTokenPlaceholder} value={botToken} onChange={(e) => setBotToken(e.target.value)} />
              <FormField label={t.reason} placeholder={t.reasonPlaceholder} value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button type="submit" variant="gold" size="lg" className="w-full" disabled={!canSubmitToken || loading}>
                {loading && <Loader2 size={16} className="animate-spin" />}
                {t.saveToken}
              </Button>
            </form>
          )}
        </div>
      )}
    </main>
  );
}
