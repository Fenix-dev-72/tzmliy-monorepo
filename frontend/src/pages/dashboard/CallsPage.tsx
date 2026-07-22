import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, ArrowDownLeft, ArrowUpRight, Loader2, Phone, PhoneCall, Settings2 } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as callsApi from "@/lib/api/calls";
import { CALLS_PAGE_SIZE } from "@/lib/api/calls";
import type { Call, ManagerMapping } from "@/lib/api/calls";
import * as usersApi from "@/lib/api/users";
import { USERS_DROPDOWN_LIMIT } from "@/lib/api/users";
import type { TenantUserRow } from "@/lib/api/users";
import { ApiError } from "@/lib/api/client";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { IntegrationCard } from "@/components/shared/IntegrationCard";
import { CopyBox } from "@/components/shared/CopyBox";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

const content = {
  uz: {
    title: "Qo'ng'iroqlar",
    sub: "Barcha kiruvchi/chiquvchi qo'ng'iroqlar jurnali",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    loadMore: "Ko'proq yuklash",
    empty: "Hali qo'ng'iroqlar yo'q",
    emptyDesc: "Integratsiya ulanganda qo'ng'iroqlar shu yerda paydo bo'ladi.",
    all: "Barchasi",
    listenError: "Yozuvni yuklab bo'lmadi",
    noRecording: "Yozuv mavjud emas",
    listen: "Tinglash",
    settings: "Integratsiya sozlamalari",
    need2fa: "Integratsiya sozlash uchun 2FA yoqilgan bo'lishi kerak.",
    connect: "Ulash",
    connected: "Ulangan",
    edit: "Tahrirlash",
    disconnect: "Uzish",
    disconnectConfirm: "Bu integratsiyani uzishga ishonchingiz komilmi? Webhook orqali yangi qo'ng'iroqlar kelishi to'xtaydi.",
    disconnected: "Integratsiya uzildi",
    cancel: "Bekor qilish",
    webhookSecret: "Webhook maxfiy kaliti",
    integrationSaved: "Integratsiya ulandi",
    genericError: "Xatolik yuz berdi",
    oneClickConnect: "1 tugma bilan ulash",
    webhookUrlTitle: "Webhook URL",
    webhookSecretHint: "Bu URL va maxfiy kalitni provayderning o'z \"webhook\" sozlamalariga joylashtiring.",
    utelSubdomain: "UTEL kompaniya kodi",
    utelSubdomainPlaceholder: "masalan: cc341",
    utelEmail: "UTEL email",
    utelPassword: "UTEL parol",
    utelConnectHint: "UTEL kompaniya kodini (boshqaruv paneli manzilidagi https://SHU-KOD.utel.uz/dashboard qismi), hisobingiz email va parolini kiriting -- ulanish va webhook sozlamalari avtomatik amalga oshiriladi, UTEL boshqaruv paneliga kirish shart emas.",
    moiZvonkiDomain: "Mois Zvonki domeni",
    moiZvonkiDomainPlaceholder: "masalan: test",
    moiZvonkiUserName: "Hisob email",
    moiZvonkiApiKey: "API kalit",
    moiZvonkiConnectHint: "Domeningizni (masalan: https://SHU-DOMEN.moizvonki.ru manzilidagi qism), hisob emailingizni va API kalitingizni (Sozlamalar -> Integratsiya) kiriting -- webhook avtomatik sozlanadi.",
    mappingTitle: "Menejer bog'lanishlari",
    mappingProvider: "Provayder",
    mappingAgentId: "Tashqi agent ID",
    mappingUser: "Xodim",
    mappingAdd: "Bog'lash",
    mappingSaved: "Bog'landi",
    noMappings: "Hali bog'lanishlar yo'q",
  },
  ru: {
    title: "Звонки",
    sub: "Журнал всех входящих/исходящих звонков",
    loadError: "Не удалось загрузить данные",
    loadMore: "Загрузить ещё",
    empty: "Звонков пока нет",
    emptyDesc: "Звонки появятся здесь после подключения интеграции.",
    all: "Все",
    listenError: "Не удалось загрузить запись",
    noRecording: "Запись недоступна",
    listen: "Слушать",
    settings: "Настройки интеграции",
    need2fa: "Для настройки интеграции требуется включённая 2FA.",
    connect: "Подключить",
    connected: "Подключено",
    edit: "Редактировать",
    disconnect: "Отключить",
    disconnectConfirm: "Точно отключить эту интеграцию? Новые звонки через webhook перестанут поступать.",
    disconnected: "Интеграция отключена",
    cancel: "Отмена",
    webhookSecret: "Секрет вебхука",
    integrationSaved: "Интеграция подключена",
    genericError: "Произошла ошибка",
    oneClickConnect: "Подключить в 1 клик",
    webhookUrlTitle: "Webhook URL",
    webhookSecretHint: "Вставьте этот URL и секретный ключ в настройку \"webhook\" самого провайдера.",
    utelSubdomain: "Код компании UTEL",
    utelSubdomainPlaceholder: "например: cc341",
    utelEmail: "Email от UTEL",
    utelPassword: "Пароль от UTEL",
    utelConnectHint: "Введите код компании UTEL (часть https://ЭТОТ-КОД.utel.uz/dashboard в адресе панели), email и пароль от аккаунта -- подключение и настройка webhook произойдут автоматически, заходить в панель UTEL не нужно.",
    moiZvonkiDomain: "Домен Мои звонки",
    moiZvonkiDomainPlaceholder: "например: test",
    moiZvonkiUserName: "Email аккаунта",
    moiZvonkiApiKey: "API ключ",
    moiZvonkiConnectHint: "Введите ваш домен (часть в адресе https://ЭТОТ-ДОМЕН.moizvonki.ru), email аккаунта и API ключ (Настройки -> Интеграция) -- webhook настроится автоматически.",
    mappingTitle: "Привязка менеджеров",
    mappingProvider: "Провайдер",
    mappingAgentId: "Внешний ID агента",
    mappingUser: "Сотрудник",
    mappingAdd: "Привязать",
    mappingSaved: "Привязано",
    noMappings: "Привязок пока нет",
  },
};

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function CallsPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken, user } = useTenantAuth();
  const has2fa = Boolean(user?.totp_enabled);
  const canManage = (user?.permissions ?? []).includes("calls.manage");

  const [calls, setCalls] = useState<Call[] | null>(null);
  const [hasMoreCalls, setHasMoreCalls] = useState(false);
  const [loadingMoreCalls, setLoadingMoreCalls] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [recordingUrls, setRecordingUrls] = useState<Record<string, string | null>>({});

  const [integrations, setIntegrations] = useState<callsApi.IntegrationCredential[]>([]);
  const [mappings, setMappings] = useState<ManagerMapping[]>([]);
  const [users, setUsers] = useState<TenantUserRow[]>([]);
  const [mappingProvider, setMappingProvider] = useState<"utel" | "moi_zvonki">("utel");
  const [mappingAgentId, setMappingAgentId] = useState("");
  const [mappingUserId, setMappingUserId] = useState("");
  const [mappingSaving, setMappingSaving] = useState(false);
  const [webhookInfo, setWebhookInfo] = useState<Record<string, { webhook_url: string; webhook_secret: string } | null>>({});

  async function load() {
    if (!accessToken) return;
    setError(null);
    try {
      const page = await callsApi.listCalls(accessToken);
      setCalls(page);
      setHasMoreCalls(page.length === CALLS_PAGE_SIZE);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.loadError);
      return;
    }
    if (canManage) {
      try {
        const [integrationsData, mappingsData, usersData] = await Promise.all([
          callsApi.listIntegrations(accessToken),
          callsApi.listManagerMappings(accessToken),
          usersApi.listUsers(accessToken, USERS_DROPDOWN_LIMIT),
        ]);
        setIntegrations(integrationsData);
        setMappings(mappingsData);
        setUsers(usersData);
      } catch {
        // settings section is optional -- call log still renders without it
      }
    }
  }

  useEffect(() => {
    if (accessToken) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function loadMoreCalls() {
    if (!accessToken || !calls) return;
    setLoadingMoreCalls(true);
    try {
      const page = await callsApi.listCalls(accessToken, undefined, CALLS_PAGE_SIZE, calls.length);
      setCalls([...calls, ...page]);
      setHasMoreCalls(page.length === CALLS_PAGE_SIZE);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : t.loadError);
    } finally {
      setLoadingMoreCalls(false);
    }
  }

  async function handleExpand(call: Call) {
    if (expandedId === call.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(call.id);
    if (call.id in recordingUrls) return;
    if (!accessToken || !call.recording_object_key) {
      setRecordingUrls((prev) => ({ ...prev, [call.id]: null }));
      return;
    }
    try {
      const { url } = await callsApi.getRecordingUrl(accessToken, call.id);
      setRecordingUrls((prev) => ({ ...prev, [call.id]: url }));
    } catch {
      setRecordingUrls((prev) => ({ ...prev, [call.id]: null }));
    }
  }

  // Real UTEL connect (2026-07-17) -- logs into UTEL with the tenant's own
  // credentials and lets the backend register our webhook URL through
  // UTEL's own API (calls/utel_client.py), so there's no manual dashboard
  // step and no webhook_secret to invent.
  async function handleConnectUtel(values: Record<string, string>) {
    if (!accessToken) return;
    try {
      await callsApi.connectUtel(accessToken, {
        subdomain: values.subdomain,
        email: values.email,
        password: values.password,
      });
      toast.success(t.integrationSaved);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        toast.error(t.need2fa);
      } else if (err instanceof ApiError && err.status === 400) {
        toast.error(err.detail);
      } else {
        toast.error(t.genericError);
      }
    }
  }

  // Real "Мои звонки" connect (2026-07-17) -- no login step needed (unlike
  // UTEL): registers our webhook URL via its webhook.subscribe API using the
  // tenant's own account email + a pre-existing api_key they copy from their
  // account settings (calls/moi_zvonki_client.py).
  async function handleConnectMoiZvonki(values: Record<string, string>) {
    if (!accessToken) return;
    try {
      await callsApi.connectMoiZvonki(accessToken, {
        domain: values.domain,
        user_name: values.user_name,
        api_key: values.api_key,
      });
      toast.success(t.integrationSaved);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        toast.error(t.need2fa);
      } else if (err instanceof ApiError && err.status === 400) {
        toast.error(err.detail);
      } else {
        toast.error(t.genericError);
      }
    }
  }

  // Disconnect (2026-07-17) -- IntegrationCard's onDisconnect prop calls
  // straight through with no confirmation, so this just opens a shared
  // ConfirmDialog; the real API call happens in handleConfirmDisconnect,
  // mirroring IntegrationsPage.tsx's identical pattern.
  const [disconnectTarget, setDisconnectTarget] = useState<"utel" | "moi_zvonki" | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleConfirmDisconnect() {
    if (!accessToken || !disconnectTarget) return;
    setDisconnecting(true);
    try {
      await callsApi.disconnectIntegration(accessToken, disconnectTarget);
      toast.success(t.disconnected);
      setDisconnectTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : t.genericError);
    } finally {
      setDisconnecting(false);
    }
  }

  // Once connected (by either method), fetch the tenant's own webhook
  // URL+secret to show instead of the connect form -- mirrors
  // IntegrationsPage.tsx's amocrmWebhookUrl/bitrix24Info effects exactly.
  useEffect(() => {
    if (!accessToken) return;
    for (const provider of ["utel", "moi_zvonki"] as const) {
      const connected = integrations.some((i) => i.provider === provider && i.is_active);
      if (!connected) {
        setWebhookInfo((prev) => ({ ...prev, [provider]: null }));
        continue;
      }
      callsApi
        .getWebhookInfo(accessToken, provider)
        .then((info) => setWebhookInfo((prev) => ({ ...prev, [provider]: info })))
        .catch(() => setWebhookInfo((prev) => ({ ...prev, [provider]: null })));
    }
  }, [accessToken, integrations]);

  async function handleCreateMapping() {
    if (!accessToken || !mappingAgentId.trim() || !mappingUserId) return;
    setMappingSaving(true);
    try {
      await callsApi.createManagerMapping(accessToken, {
        provider: mappingProvider,
        external_agent_id: mappingAgentId.trim(),
        user_id: mappingUserId,
      });
      toast.success(t.mappingSaved);
      setMappingAgentId("");
      setMappingUserId("");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 403 ? t.need2fa : t.genericError);
    } finally {
      setMappingSaving(false);
    }
  }

  const statuses = useMemo(() => {
    if (!calls) return [];
    return [...new Set(calls.map((c) => c.status))];
  }, [calls]);

  const filteredCalls = useMemo(() => {
    if (!calls) return null;
    return statusFilter === "all" ? calls : calls.filter((c) => c.status === statusFilter);
  }, [calls, statusFilter]);

  const usersById = new Map(users.map((u) => [u.id, u]));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <h1 className="font-heading mb-1 text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
        <p className="text-sm text-foreground-muted">{t.sub}</p>
      </div>

      {error && (
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center">
          <AlertCircle size={28} className="text-destructive" />
          <p className="text-sm text-foreground-muted">{error}</p>
        </div>
      )}

      {!error && calls === null && (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="text-primary animate-spin" />
        </div>
      )}

      {!error && calls !== null && calls.length === 0 && (
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center sm:p-14">
          <Phone size={32} className="text-foreground-muted" />
          <h2 className="font-heading text-lg font-bold text-foreground">{t.empty}</h2>
          <p className="max-w-md text-sm text-foreground-muted">{t.emptyDesc}</p>
        </div>
      )}

      {!error && calls !== null && calls.length > 0 && (
        <>
          {statuses.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                onClick={() => setStatusFilter("all")}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === "all" ? "border-primary/40 bg-primary/12 text-primary" : "border-card-border text-foreground-muted"
                }`}
              >
                {t.all}
              </button>
              {statuses.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                    statusFilter === s ? "border-primary/40 bg-primary/12 text-primary" : "border-card-border text-foreground-muted"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="glass-card overflow-hidden p-0">
            {filteredCalls!.map((call, i) => {
              const otherNumber = call.direction === "inbound" ? call.from_number : call.to_number;
              const expanded = expandedId === call.id;
              return (
                <div key={call.id} className={i < filteredCalls!.length - 1 ? "border-b border-card-border/60" : ""}>
                  <button
                    onClick={() => handleExpand(call)}
                    className="hover:bg-accent/40 flex w-full items-center justify-between gap-3 p-4 text-left transition-colors sm:p-5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className="flex size-9 shrink-0 items-center justify-center rounded-full"
                        style={{ background: "var(--card-border)" }}
                      >
                        {call.direction === "inbound" ? (
                          <ArrowDownLeft size={16} className="text-success" />
                        ) : (
                          <ArrowUpRight size={16} className="text-primary" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-mono truncate text-sm font-semibold text-foreground">{otherNumber}</div>
                        <div className="text-xs text-foreground-muted">
                          {new Date(call.started_at).toLocaleString()} · {formatDuration(call.duration_seconds)}
                        </div>
                      </div>
                    </div>
                    <StatusBadge status={call.status} label={call.status} />
                  </button>
                  {expanded && (
                    <div className="bg-background/40 px-4 pb-4 sm:px-5">
                      {call.recording_object_key === null ? (
                        <p className="text-xs text-foreground-muted">{t.noRecording}</p>
                      ) : recordingUrls[call.id] === undefined ? (
                        <Loader2 size={16} className="text-primary animate-spin" />
                      ) : recordingUrls[call.id] === null ? (
                        <p className="text-destructive text-xs">{t.listenError}</p>
                      ) : (
                        // eslint-disable-next-line jsx-a11y/media-has-caption
                        <audio controls src={recordingUrls[call.id]!} className="w-full" />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {hasMoreCalls && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" disabled={loadingMoreCalls} onClick={loadMoreCalls}>
                {loadingMoreCalls && <Loader2 size={16} className="animate-spin" />}
                {t.loadMore}
              </Button>
            </div>
          )}
        </>
      )}

      {canManage && (
        <div className="mt-10">
          <div className="mb-4 flex items-center gap-2">
            <Settings2 size={16} className="text-foreground-muted" />
            <h2 className="font-heading text-base font-bold text-foreground">{t.settings}</h2>
          </div>

          {!has2fa && (
            <div className="border-primary/25 bg-primary/8 mb-4 flex items-center gap-3 rounded-2xl border p-4">
              <span className="flex-1 text-sm text-foreground">{t.need2fa}</span>
            </div>
          )}

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <IntegrationCard
              icon={PhoneCall}
              brandColor="#4C6FFF"
              name="UTEL"
              connected={integrations.some((i) => i.provider === "utel" && i.is_active)}
              connectLabel={t.connect}
              connectedLabel={t.connected}
              editLabel={t.edit}
              submitLabel={t.oneClickConnect}
              hint={t.utelConnectHint}
              fields={[
                { key: "subdomain", label: t.utelSubdomain, placeholder: t.utelSubdomainPlaceholder },
                { key: "email", label: t.utelEmail },
                { key: "password", label: t.utelPassword, secret: true },
              ]}
              onSubmit={handleConnectUtel}
              connectedInfo={
                webhookInfo.utel && (
                  <>
                    <CopyBox hint={t.webhookSecretHint} label={t.webhookUrlTitle} value={webhookInfo.utel.webhook_url} secret />
                    <CopyBox label={t.webhookSecret} value={webhookInfo.utel.webhook_secret} secret />
                  </>
                )
              }
              onDisconnect={
                integrations.some((i) => i.provider === "utel" && i.is_active)
                  ? () => Promise.resolve(setDisconnectTarget("utel"))
                  : undefined
              }
              disconnectLabel={t.disconnect}
            />
            <IntegrationCard
              icon={PhoneCall}
              brandColor="#2FBF71"
              name="Мои звонки"
              connected={integrations.some((i) => i.provider === "moi_zvonki" && i.is_active)}
              connectLabel={t.connect}
              connectedLabel={t.connected}
              editLabel={t.edit}
              submitLabel={t.oneClickConnect}
              hint={t.moiZvonkiConnectHint}
              fields={[
                { key: "domain", label: t.moiZvonkiDomain, placeholder: t.moiZvonkiDomainPlaceholder },
                { key: "user_name", label: t.moiZvonkiUserName },
                { key: "api_key", label: t.moiZvonkiApiKey, secret: true },
              ]}
              onSubmit={handleConnectMoiZvonki}
              connectedInfo={
                webhookInfo.moi_zvonki && (
                  <>
                    <CopyBox
                      hint={t.webhookSecretHint}
                      label={t.webhookUrlTitle}
                      value={webhookInfo.moi_zvonki.webhook_url}
                      secret
                    />
                    <CopyBox label={t.webhookSecret} value={webhookInfo.moi_zvonki.webhook_secret} secret />
                  </>
                )
              }
              onDisconnect={
                integrations.some((i) => i.provider === "moi_zvonki" && i.is_active)
                  ? () => Promise.resolve(setDisconnectTarget("moi_zvonki"))
                  : undefined
              }
              disconnectLabel={t.disconnect}
            />
          </div>

          <ConfirmDialog
            open={disconnectTarget !== null}
            title={t.disconnect}
            description={t.disconnectConfirm}
            confirmLabel={t.disconnect}
            cancelLabel={t.cancel}
            destructive
            loading={disconnecting}
            onConfirm={handleConfirmDisconnect}
            onCancel={() => setDisconnectTarget(null)}
          />

          <div className="glass-card p-5 sm:p-6">
            <h3 className="mb-4 text-sm font-bold text-foreground">{t.mappingTitle}</h3>
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="text-foreground mb-1.5 block text-sm font-medium">{t.mappingProvider}</label>
                <select
                  value={mappingProvider}
                  onChange={(e) => setMappingProvider(e.target.value as "utel" | "moi_zvonki")}
                  className="border-card-border bg-input-background text-foreground focus-visible:border-ring focus-visible:ring-ring/15 h-11 w-full rounded-xl border px-3.5 text-sm outline-none focus-visible:ring-[3px]"
                >
                  <option value="utel">UTEL</option>
                  <option value="moi_zvonki">Мои звонки</option>
                </select>
              </div>
              <FormField
                label={t.mappingAgentId}
                value={mappingAgentId}
                onChange={(e) => setMappingAgentId(e.target.value)}
                className="mb-0"
              />
              <div>
                <label className="text-foreground mb-1.5 block text-sm font-medium">{t.mappingUser}</label>
                <select
                  value={mappingUserId}
                  onChange={(e) => setMappingUserId(e.target.value)}
                  className="border-card-border bg-input-background text-foreground focus-visible:border-ring focus-visible:ring-ring/15 h-11 w-full rounded-xl border px-3.5 text-sm outline-none focus-visible:ring-[3px]"
                >
                  <option value="">—</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email ?? u.phone}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Button
              variant="gold"
              size="sm"
              disabled={!mappingAgentId.trim() || !mappingUserId || mappingSaving}
              onClick={handleCreateMapping}
            >
              {mappingSaving && <Loader2 size={14} className="animate-spin" />}
              {t.mappingAdd}
            </Button>

            {mappings.length > 0 && (
              <div className="mt-5 flex flex-col gap-2">
                {mappings.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-foreground-muted">
                      {m.provider} · {m.external_agent_id}
                    </span>
                    <span className="text-foreground">{usersById.get(m.user_id)?.email ?? m.user_id.slice(0, 8)}</span>
                  </div>
                ))}
              </div>
            )}
            {mappings.length === 0 && <p className="mt-4 text-xs text-foreground-muted">{t.noMappings}</p>}
          </div>
        </div>
      )}
    </main>
  );
}
