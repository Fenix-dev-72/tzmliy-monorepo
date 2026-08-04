import { useEffect, useState } from "react";
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
import { DashboardPageContainer } from "@/components/shared/DashboardPageContainer";
import { EntityListCard, EntityListRow } from "@/components/shared/EntityListCard";
import { SearchFilterBar } from "@/components/shared/SearchFilterBar";
import { PaginationBar } from "@/components/shared/PaginationBar";

const content = {
  uz: {
    title: "Qo'ng'iroqlar",
    sub: "Barcha kiruvchi/chiquvchi qo'ng'iroqlar jurnali",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    loadMore: "Ko'proq yuklash",
    empty: "Hali qo'ng'iroqlar yo'q",
    emptyDesc: "Integratsiya ulanganda qo'ng'iroqlar shu yerda paydo bo'ladi.",
    all: "Barchasi",
    searchPlaceholder: "Telefon raqami bo'yicha qidirish...",
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
    searchPlaceholder: "Поиск по номеру телефона...",
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
  const [callsTotal, setCallsTotal] = useState(0);
  const [callsPage, setCallsPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  // Debounced separately from searchQuery so the API isn't hit on every
  // keystroke -- the effect below fires the actual request.
  const [searchTerm, setSearchTerm] = useState("");
  // Populated once from the first unfiltered load and kept stable after that
  // -- filtering is now server-side (2026-07-28, fixes pagination showing
  // the *unfiltered* total page count while a status tab hid almost every
  // row), so recomputing this from the current filtered page would make the
  // tabs themselves disappear once a filter narrows the result set.
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
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

  async function load(targetPage: number) {
    if (!accessToken) return;
    setError(null);
    try {
      const result = await callsApi.listCalls(
        accessToken,
        undefined,
        CALLS_PAGE_SIZE,
        (targetPage - 1) * CALLS_PAGE_SIZE,
        statusFilter === "all" ? undefined : statusFilter,
        searchTerm.trim() || undefined,
      );
      setCalls(result.items);
      setCallsTotal(result.total);
      if (statusFilter === "all" && !searchTerm.trim()) {
        setAvailableStatuses((prev) => {
          const merged = new Set([...prev, ...result.items.map((c) => c.status)]);
          return [...merged];
        });
      }
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
        setUsers(usersData.items);
      } catch {
        // settings section is optional -- call log still renders without it
      }
    }
  }

  // Debounce the search box -- fires the actual request 350ms after typing
  // stops, not on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearchTerm(searchQuery), 350);
    return () => clearTimeout(id);
  }, [searchQuery]);

  // Any filter/search change starts back at page 1 -- staying on e.g. page 14
  // after narrowing the result set would just show an empty page.
  useEffect(() => {
    setCallsPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, searchTerm]);

  useEffect(() => {
    if (accessToken) load(callsPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, callsPage, statusFilter, searchTerm]);

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
      await load(callsPage);
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
      await load(callsPage);
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
      await load(callsPage);
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
      await load(callsPage);
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 403 ? t.need2fa : t.genericError);
    } finally {
      setMappingSaving(false);
    }
  }

  const hasActiveFilter = statusFilter !== "all" || searchTerm.trim().length > 0;
  const noResultsAtAll = calls !== null && calls.length === 0 && !hasActiveFilter;

  const usersById = new Map(users.map((u) => [u.id, u]));

  return (
    <DashboardPageContainer>
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

      {!error && noResultsAtAll && (
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center sm:p-14">
          <Phone size={32} className="text-foreground-muted" />
          <h2 className="font-heading text-lg font-bold text-foreground">{t.empty}</h2>
          <p className="max-w-md text-sm text-foreground-muted">{t.emptyDesc}</p>
        </div>
      )}

      {!error && calls !== null && !noResultsAtAll && (
        <>
          <SearchFilterBar
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t.searchPlaceholder}
            filters={
              availableStatuses.length > 1
                ? [{ value: "all", label: t.all }, ...availableStatuses.map((s) => ({ value: s, label: s }))]
                : undefined
            }
            activeFilter={statusFilter}
            onFilterChange={setStatusFilter}
          />

          {calls.length === 0 && (
            <p className="glass-card py-10 text-center text-sm text-foreground-muted">{t.empty}</p>
          )}

          {/* Each call is its own spaced card, not one continuous divided
              list (same "bo'laklarga bo'l" feedback as Users/Sales/
              Customers/Roles). */}
          <div className="flex flex-col gap-3">
            {calls.map((call) => {
              const otherNumber = call.direction === "inbound" ? call.from_number : call.to_number;
              const expanded = expandedId === call.id;
              return (
                <div key={call.id} className="bg-card/95 border-card-border overflow-hidden rounded-[14px] border shadow-sm">
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

          <PaginationBar page={callsPage} totalPages={Math.ceil(callsTotal / CALLS_PAGE_SIZE)} onChange={setCallsPage} />
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
              <EntityListCard className="mt-5">
                {mappings.map((m, i) => (
                  <EntityListRow key={m.id} isLast={i === mappings.length - 1} className="p-3 text-sm">
                    <span className="text-foreground-muted">
                      {m.provider} · {m.external_agent_id}
                    </span>
                    <span className="text-foreground">{usersById.get(m.user_id)?.email ?? m.user_id.slice(0, 8)}</span>
                  </EntityListRow>
                ))}
              </EntityListCard>
            )}
            {mappings.length === 0 && <p className="mt-4 text-xs text-foreground-muted">{t.noMappings}</p>}
          </div>
        </div>
      )}
    </DashboardPageContainer>
  );
}
