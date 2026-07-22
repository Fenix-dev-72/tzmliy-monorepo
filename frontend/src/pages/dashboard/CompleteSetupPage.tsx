import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Loader2, MessageCircle, Phone, Users2 } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as notificationsApi from "@/lib/api/notifications";
import * as callsApi from "@/lib/api/calls";
import * as crmApi from "@/lib/api/crm";
import { ApiError } from "@/lib/api/client";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import type { PendingLink } from "@/lib/auth/types";

const content = {
  uz: {
    title: "Hisobingizni sozlang",
    sub: "Davom etishdan oldin quyidagi ulanishlarni tugatishingiz kerak.",
    telegram: {
      label: "Telegram",
      desc: "Shaxsiy hisobotlaringiz Telegram orqali sizga to'g'ridan-to'g'ri yuborilishi uchun bog'lang.",
      btn: "Havola olish",
      opened: "Telegram'da oching va /start bosing",
      linked: "Ulandi",
      notConfigured: "Tenant uchun Telegram bot hali sozlanmagan -- adminingizdan so'rang",
      configureTitle: "Tenant uchun Telegram botni ulang",
      configureDesc: "Bot ulangach, barcha xodimlar (shu jumladan siz) o'z shaxsiy hisobotlarini olish uchun ulanishlari mumkin bo'ladi.",
      botTokenPlaceholder: "Bot token (@BotFather'dan)",
      configureBtn: "Botni ulash",
      needs2fa: "Bu amal uchun 2FA yoqilgan bo'lishi kerak.",
      enable2fa: "2FA'ni yoqish",
    },
    utel: {
      label: "UTEL (qo'ng'iroqlar)",
      desc: "Qo'ng'iroqlaringiz to'g'ri sizga biriktirilishi uchun UTEL agent ID'ingizni kiriting.",
      placeholder: "UTEL agent ID",
      btn: "Ulash",
      linked: "Ulandi",
    },
    crm: {
      label: "CRM",
      desc: "Mijoz/lidlar to'g'ri sizga biriktirilishi uchun CRM foydalanuvchi ID'ingizni kiriting.",
      providerLabel: "Provayder",
      placeholder: "CRM foydalanuvchi ID",
      candidatesPlaceholder: "O'zingizni tanlang",
      candidatesLoading: "Foydalanuvchilar yuklanmoqda...",
      btn: "Ulash",
      linked: "Ulandi",
    },
    genericError: "Xatolik yuz berdi",
    allDone: "Barcha ulanishlar tugallandi",
  },
  ru: {
    title: "Настройте аккаунт",
    sub: "Перед продолжением завершите следующие подключения.",
    telegram: {
      label: "Telegram",
      desc: "Подключите, чтобы личные отчёты приходили вам напрямую в Telegram.",
      btn: "Получить ссылку",
      opened: "Откройте Telegram и нажмите /start",
      linked: "Подключено",
      notConfigured: "Telegram-бот для тенанта ещё не настроен -- обратитесь к админу",
      configureTitle: "Подключите Telegram-бота для тенанта",
      configureDesc: "После подключения бота все сотрудники (включая вас) смогут подключить личные отчёты.",
      botTokenPlaceholder: "Токен бота (от @BotFather)",
      configureBtn: "Подключить бота",
      needs2fa: "Для этого действия должна быть включена 2FA.",
      enable2fa: "Включить 2FA",
    },
    utel: {
      label: "UTEL (звонки)",
      desc: "Введите свой ID агента UTEL, чтобы звонки правильно привязывались к вам.",
      placeholder: "UTEL agent ID",
      btn: "Подключить",
      linked: "Подключено",
    },
    crm: {
      label: "CRM",
      desc: "Введите свой CRM ID, чтобы клиенты/лиды правильно привязывались к вам.",
      providerLabel: "Провайдер",
      placeholder: "CRM ID пользователя",
      candidatesPlaceholder: "Выберите себя",
      candidatesLoading: "Загрузка пользователей...",
      btn: "Подключить",
      linked: "Подключено",
    },
    genericError: "Произошла ошибка",
    allDone: "Все подключения завершены",
  },
};

function SetupCard({
  icon,
  title,
  description,
  done,
  doneLabel,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  done: boolean;
  doneLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card auth-card-enter p-6">
      <div className="mb-3 flex items-center gap-3">
        <div className="border-primary/25 bg-primary/12 flex size-10 items-center justify-center rounded-xl border">
          {icon}
        </div>
        <h2 className="font-heading text-base font-bold text-foreground">{title}</h2>
      </div>
      <p className="mb-4 text-sm text-foreground-muted">{description}</p>
      {done ? (
        <div className="border-success/25 bg-success/12 flex items-center gap-2 rounded-xl border px-3 py-2">
          <CheckCircle2 size={16} className="text-success" />
          <span className="text-success text-sm font-medium">{doneLabel}</span>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export function CompleteSetupPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken, user, refetchUser } = useTenantAuth();

  const pending = new Set<PendingLink>(user?.pending_links ?? []);
  const canManageNotifications = (user?.permissions ?? []).includes("notifications.manage");

  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [botNotConfigured, setBotNotConfigured] = useState(false);

  const [botToken, setBotToken] = useState("");
  const [configuringBot, setConfiguringBot] = useState(false);
  const [botConfigError, setBotConfigError] = useState<string | null>(null);
  const [botNeeds2fa, setBotNeeds2fa] = useState(false);

  const [utelAgentId, setUtelAgentId] = useState("");
  const [utelLoading, setUtelLoading] = useState(false);
  const [utelError, setUtelError] = useState<string | null>(null);

  const [crmProvider, setCrmProvider] = useState<"amocrm" | "bitrix24">("amocrm");
  const [crmManagerId, setCrmManagerId] = useState("");
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmError, setCrmError] = useState<string | null>(null);
  // Real name dropdown instead of a raw id text field, once the tenant has
  // actually connected this provider (2026-07-15) -- [] (not an error)
  // means nothing connected yet, so the field below falls back to manual
  // entry rather than showing an empty, useless dropdown.
  const [crmCandidates, setCrmCandidates] = useState<crmApi.ManagerCandidate[]>([]);
  const [crmCandidatesLoading, setCrmCandidatesLoading] = useState(false);

  useEffect(() => {
    if (!accessToken || !pending.has("crm")) return;
    setCrmCandidatesLoading(true);
    crmApi
      .listManagerCandidates(accessToken, crmProvider)
      .then(setCrmCandidates)
      .catch(() => setCrmCandidates([]))
      .finally(() => setCrmCandidatesLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, crmProvider]);

  // Poll /auth/me every 3s while Telegram is still pending -- the actual
  // linking happens asynchronously (user clicks the link in Telegram, a
  // background worker picks up the /start message), so nothing on this page
  // can know the moment it lands except by asking again.
  const pollingRef = useRef(false);
  useEffect(() => {
    if (!pending.has("telegram") || !deepLink || pollingRef.current) return;
    pollingRef.current = true;
    const interval = setInterval(() => {
      refetchUser().catch(() => {});
    }, 3000);
    return () => {
      clearInterval(interval);
      pollingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLink]);

  async function handleTelegramLink() {
    if (!accessToken) return;
    setTelegramLoading(true);
    setTelegramError(null);
    setBotNotConfigured(false);
    try {
      const res = await notificationsApi.createTelegramLinkToken(accessToken);
      setDeepLink(res.deep_link);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        // Tenant's own bot isn't configured yet -- whoever holds
        // notifications.manage (the tenant/admin) can fix this inline below
        // instead of being stuck with no way forward.
        setBotNotConfigured(true);
      } else {
        setTelegramError(err instanceof ApiError ? err.detail : t.genericError);
      }
    } finally {
      setTelegramLoading(false);
    }
  }

  async function handleConfigureBot() {
    if (!accessToken || !botToken.trim()) return;
    setConfiguringBot(true);
    setBotConfigError(null);
    setBotNeeds2fa(false);
    try {
      await notificationsApi.configureTelegramBot(accessToken, botToken.trim());
      setBotNotConfigured(false);
      setBotToken("");
      // The tenant bot is now configured -- immediately fetch this user's
      // own personal deep link too, so the admin doesn't need a second click.
      await handleTelegramLink();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setBotNeeds2fa(true);
      } else {
        setBotConfigError(err instanceof ApiError ? err.detail : t.genericError);
      }
    } finally {
      setConfiguringBot(false);
    }
  }

  async function handleUtelLink() {
    if (!accessToken || !utelAgentId.trim()) return;
    setUtelLoading(true);
    setUtelError(null);
    try {
      await callsApi.createOwnManagerMapping(accessToken, { provider: "utel", external_agent_id: utelAgentId.trim() });
      await refetchUser();
      toast.success(t.utel.linked);
    } catch (err) {
      setUtelError(err instanceof ApiError ? err.detail : t.genericError);
    } finally {
      setUtelLoading(false);
    }
  }

  async function handleCrmLink() {
    if (!accessToken || !crmManagerId.trim()) return;
    setCrmLoading(true);
    setCrmError(null);
    try {
      await crmApi.createOwnManagerMapping(accessToken, { provider: crmProvider, external_manager_id: crmManagerId.trim() });
      await refetchUser();
      toast.success(t.crm.linked);
    } catch (err) {
      setCrmError(err instanceof ApiError ? err.detail : t.genericError);
    } finally {
      setCrmLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="font-heading mb-2 text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
      <p className="mb-6 text-sm text-foreground-muted sm:mb-8">{t.sub}</p>

      <div className="flex flex-col gap-5">
        {pending.has("telegram") && (
          <SetupCard
            icon={<MessageCircle size={18} className="text-primary" />}
            title={t.telegram.label}
            description={t.telegram.desc}
            done={false}
            doneLabel={t.telegram.linked}
          >
            {deepLink ? (
              <a
                href={deepLink}
                target="_blank"
                rel="noreferrer"
                className="text-primary flex items-center gap-1.5 text-sm font-medium hover:underline"
              >
                {t.telegram.opened} <ExternalLink size={14} />
              </a>
            ) : botNotConfigured ? (
              canManageNotifications ? (
                <div className="border-border bg-background/60 rounded-xl border p-4">
                  <p className="mb-1 text-sm font-semibold text-foreground">{t.telegram.configureTitle}</p>
                  <p className="mb-3 text-xs text-foreground-muted">{t.telegram.configureDesc}</p>
                  <FormField
                    label=""
                    placeholder={t.telegram.botTokenPlaceholder}
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    error={botConfigError ?? undefined}
                  />
                  <Button variant="gold" size="sm" disabled={!botToken.trim() || configuringBot} onClick={handleConfigureBot}>
                    {configuringBot && <Loader2 size={14} className="animate-spin" />}
                    {t.telegram.configureBtn}
                  </Button>
                  {botNeeds2fa && (
                    <p className="text-destructive mt-2 text-[13px] font-medium">
                      {t.telegram.needs2fa}{" "}
                      <Link to="/dashboard/settings/2fa" className="underline">
                        {t.telegram.enable2fa}
                      </Link>
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-destructive text-[13px] font-medium">{t.telegram.notConfigured}</p>
              )
            ) : (
              <Button variant="gold" size="sm" disabled={telegramLoading} onClick={handleTelegramLink}>
                {telegramLoading && <Loader2 size={14} className="animate-spin" />}
                {t.telegram.btn}
              </Button>
            )}
            {telegramError && <p className="text-destructive mt-2 text-[13px] font-medium">{telegramError}</p>}
          </SetupCard>
        )}

        {pending.has("utel") && (
          <SetupCard
            icon={<Phone size={18} className="text-primary" />}
            title={t.utel.label}
            description={t.utel.desc}
            done={false}
            doneLabel={t.utel.linked}
          >
            <FormField
              label=""
              placeholder={t.utel.placeholder}
              value={utelAgentId}
              onChange={(e) => setUtelAgentId(e.target.value)}
              error={utelError ?? undefined}
            />
            <Button variant="gold" size="sm" disabled={!utelAgentId.trim() || utelLoading} onClick={handleUtelLink}>
              {utelLoading && <Loader2 size={14} className="animate-spin" />}
              {t.utel.btn}
            </Button>
          </SetupCard>
        )}

        {pending.has("crm") && (
          <SetupCard
            icon={<Users2 size={18} className="text-primary" />}
            title={t.crm.label}
            description={t.crm.desc}
            done={false}
            doneLabel={t.crm.linked}
          >
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() => setCrmProvider("amocrm")}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${crmProvider === "amocrm" ? "border-primary bg-primary/12 text-primary" : "border-border text-foreground-muted"}`}
              >
                AmoCRM
              </button>
              <button
                type="button"
                onClick={() => setCrmProvider("bitrix24")}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${crmProvider === "bitrix24" ? "border-primary bg-primary/12 text-primary" : "border-border text-foreground-muted"}`}
              >
                Bitrix24
              </button>
            </div>
            {crmCandidatesLoading ? (
              <div className="text-foreground-muted mb-3 flex items-center gap-2 text-sm">
                <Loader2 size={14} className="animate-spin" />
                {t.crm.candidatesLoading}
              </div>
            ) : crmCandidates.length > 0 ? (
              <select
                value={crmManagerId}
                onChange={(e) => setCrmManagerId(e.target.value)}
                className="border-border bg-background-subtle text-foreground mb-3 w-full rounded-xl border px-3 py-2 text-sm"
              >
                <option value="">{t.crm.candidatesPlaceholder}</option>
                {crmCandidates.map((c) => (
                  <option key={c.external_manager_id} value={c.external_manager_id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <FormField
                label=""
                placeholder={t.crm.placeholder}
                value={crmManagerId}
                onChange={(e) => setCrmManagerId(e.target.value)}
                error={crmError ?? undefined}
              />
            )}
            <Button variant="gold" size="sm" disabled={!crmManagerId.trim() || crmLoading} onClick={handleCrmLink}>
              {crmLoading && <Loader2 size={14} className="animate-spin" />}
              {t.crm.btn}
            </Button>
          </SetupCard>
        )}
      </div>
    </main>
  );
}
