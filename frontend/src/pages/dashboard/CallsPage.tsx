import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, ArrowDownLeft, ArrowUpRight, Loader2, Phone, PhoneCall, Settings2 } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as callsApi from "@/lib/api/calls";
import type { Call, ManagerMapping } from "@/lib/api/calls";
import * as usersApi from "@/lib/api/users";
import type { TenantUserRow } from "@/lib/api/users";
import { ApiError } from "@/lib/api/client";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { IntegrationCard } from "@/components/shared/IntegrationCard";

const content = {
  uz: {
    title: "Qo'ng'iroqlar",
    sub: "Barcha kiruvchi/chiquvchi qo'ng'iroqlar jurnali",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
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
    webhookSecret: "Webhook maxfiy kaliti",
    apiKey: "API kalit (ixtiyoriy)",
    save: "Saqlash",
    integrationSaved: "Integratsiya ulandi",
    genericError: "Xatolik yuz berdi",
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
    webhookSecret: "Секрет вебхука",
    apiKey: "API ключ (необязательно)",
    save: "Сохранить",
    integrationSaved: "Интеграция подключена",
    genericError: "Произошла ошибка",
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

  async function load() {
    if (!accessToken) return;
    setError(null);
    try {
      setCalls(await callsApi.listCalls(accessToken));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.loadError);
      return;
    }
    if (canManage) {
      try {
        const [integrationsData, mappingsData, usersData] = await Promise.all([
          callsApi.listIntegrations(accessToken),
          callsApi.listManagerMappings(accessToken),
          usersApi.listUsers(accessToken),
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

  async function handleConnectIntegration(provider: "utel" | "moi_zvonki", values: Record<string, string>) {
    if (!accessToken) return;
    try {
      await callsApi.createIntegration(accessToken, {
        provider,
        webhook_secret: values.webhook_secret,
        api_key: values.api_key || undefined,
      });
      toast.success(t.integrationSaved);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 403 ? t.need2fa : t.genericError);
    }
  }

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
              submitLabel={t.save}
              fields={[
                { key: "webhook_secret", label: t.webhookSecret, secret: true },
                { key: "api_key", label: t.apiKey, secret: true, optional: true },
              ]}
              onSubmit={(values) => handleConnectIntegration("utel", values)}
            />
            <IntegrationCard
              icon={PhoneCall}
              brandColor="#2FBF71"
              name="Мои звонки"
              connected={integrations.some((i) => i.provider === "moi_zvonki" && i.is_active)}
              connectLabel={t.connect}
              connectedLabel={t.connected}
              submitLabel={t.save}
              fields={[
                { key: "webhook_secret", label: t.webhookSecret, secret: true },
                { key: "api_key", label: t.apiKey, secret: true, optional: true },
              ]}
              onSubmit={(values) => handleConnectIntegration("moi_zvonki", values)}
            />
          </div>

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
