import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Building2, Loader2, Megaphone, Workflow, Zap } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as crmApi from "@/lib/api/crm";
import type { AdCampaign, CrmIntegration, CrmLeadSync, OAuthProvider } from "@/lib/api/crm";
import { ApiError } from "@/lib/api/client";
import { IntegrationCard } from "@/components/shared/IntegrationCard";
import { CopyBox } from "@/components/shared/CopyBox";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/auth/FormField";

const content = {
  uz: {
    title: "Integratsiyalar",
    sub: "Tashqi CRM va reklama tizimlarini ulash",
    connect: "Ulash",
    connected: "Ulangan",
    edit: "Tahrirlash",
    disconnect: "Uzish",
    disconnectConfirm: "Bu integratsiyani uzishga ishonchingiz komilmi? Webhook orqali yangi ma'lumotlar kelishi to'xtaydi.",
    disconnected: "Integratsiya uzildi",
    cancel: "Bekor qilish",
    save: "Saqlash",
    need2fa: "Integratsiya sozlash uchun 2FA yoqilgan bo'lishi kerak.",
    genericError: "Xatolik yuz berdi",
    connectedToast: "Integratsiya ulandi",
    oneClickConnect: "1 tugma bilan ulash",
    oneClickDomainPlaceholder: "subdomen (masalan: mycompany)",
    oneClickNotConfigured: "Bu integratsiya uchun OAuth hali sozlanmagan",
    oneClickDomainRequired: "Iltimos, subdomenni kiriting",
    oauthConnectedToast: "Muvaffaqiyatli ulandi (OAuth)",
    oauthErrorToast: "OAuth orqali ulashda xatolik yuz berdi",
    subdomain: "Subdomen",
    apiToken: "API token",
    webhookSecret: "Webhook maxfiy kaliti",
    webhookUrl: "Webhook bazaviy URL",
    appToken: "Ilova tokeni",
    adAccountId: "Reklama hisob ID",
    accessToken: "Access token",
    invalidWebhookUrl: "Webhook URL noto'g'ri -- Bitrix24'da tekshiring",
    bitrixTokenHint: "Bu tokenni Bitrix24'ning \"Outgoing webhook\" sozlamasidagi \"application_token\" maydoniga qo'ying:",
    copy: "Nusxalash",
    copied: "Nusxalandi",
    webhookUrlTitle: "Webhook URL",
    webhookUrlHint: "Bu havolani AmoCRM hisobingizdagi \"Webhooks\" sozlamasiga qo'ying -- shunda lid holati o'zgarganda Tizimly avtomatik xabar oladi. Admin ham, xodimlar ham shu yerdan olishlari mumkin.",
    bitrixWebhookUrlHint: "Bu URL'ni Bitrix24'ning \"Outgoing webhook\" sozlamasidagi handler maydoniga qo'ying.",
    leadsTitle: "Lidlar tarixi",
    noLeads: "Hali sinxronlangan lidlar yo'q",
    campaignsTitle: "Reklama kampaniyalari",
    noCampaigns: "Hali kampaniyalar yo'q",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
  },
  ru: {
    title: "Интеграции",
    sub: "Подключение внешних CRM и рекламных систем",
    connect: "Подключить",
    connected: "Подключено",
    edit: "Редактировать",
    disconnect: "Отключить",
    disconnectConfirm: "Точно отключить эту интеграцию? Новые данные через webhook перестанут поступать.",
    disconnected: "Интеграция отключена",
    cancel: "Отмена",
    save: "Сохранить",
    need2fa: "Для настройки интеграции требуется включённая 2FA.",
    genericError: "Произошла ошибка",
    connectedToast: "Интеграция подключена",
    oneClickConnect: "Подключить в 1 клик",
    oneClickDomainPlaceholder: "поддомен (например: mycompany)",
    oneClickNotConfigured: "OAuth для этой интеграции ещё не настроен",
    oneClickDomainRequired: "Пожалуйста, введите поддомен",
    oauthConnectedToast: "Успешно подключено (OAuth)",
    oauthErrorToast: "Ошибка при подключении через OAuth",
    subdomain: "Поддомен",
    apiToken: "API токен",
    webhookSecret: "Секрет вебхука",
    webhookUrl: "Базовый URL вебхука",
    appToken: "Токен приложения",
    adAccountId: "ID рекламного аккаунта",
    accessToken: "Access token",
    invalidWebhookUrl: "Неверный webhook URL -- проверьте в Bitrix24",
    bitrixTokenHint: "Вставьте этот токен в поле \"application_token\" настройки \"Исходящий вебхук\" в Bitrix24:",
    copy: "Копировать",
    copied: "Скопировано",
    webhookUrlTitle: "Webhook URL",
    webhookUrlHint: "Вставьте эту ссылку в настройку \"Webhooks\" вашего аккаунта AmoCRM -- тогда Tizimly будет автоматически получать уведомления при изменении статуса лида. Её могут получить как админ, так и сотрудники.",
    bitrixWebhookUrlHint: "Вставьте этот URL в поле обработчика настройки \"Исходящий вебхук\" в Bitrix24.",
    leadsTitle: "История лидов",
    noLeads: "Синхронизированных лидов пока нет",
    campaignsTitle: "Рекламные кампании",
    noCampaigns: "Кампаний пока нет",
    loadError: "Не удалось загрузить данные",
  },
};

function OneClickConnectRow({
  provider,
  needsDomain,
  domain,
  onDomainChange,
  connecting,
  onConnect,
  label,
  domainPlaceholder,
}: {
  provider: OAuthProvider;
  needsDomain: boolean;
  domain: string;
  onDomainChange: (value: string) => void;
  connecting: boolean;
  onConnect: () => void;
  label: string;
  domainPlaceholder: string;
}) {
  return (
    <div className="mt-2 flex items-center gap-2" data-provider={provider}>
      {needsDomain && (
        <FormField
          label=""
          value={domain}
          onChange={(e) => onDomainChange(e.target.value)}
          placeholder={domainPlaceholder}
          className="mb-0 flex-1"
        />
      )}
      <Button variant="outline" size="sm" disabled={connecting} onClick={onConnect} className="shrink-0">
        {connecting ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
        {label}
      </Button>
    </div>
  );
}

export function IntegrationsPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { user } = useTenantAuth();
  const accessToken = useTenantAuth().accessToken;
  const has2fa = Boolean(user?.totp_enabled);
  const canView = (user?.permissions ?? []).includes("crm.view");
  const canManage = (user?.permissions ?? []).includes("crm.manage");

  const [integrations, setIntegrations] = useState<CrmIntegration[]>([]);
  const [leads, setLeads] = useState<CrmLeadSync[] | null>(null);
  const [campaigns, setCampaigns] = useState<AdCampaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [oauthDomain, setOauthDomain] = useState<Record<string, string>>({});
  const [oauthConnecting, setOauthConnecting] = useState<OAuthProvider | null>(null);
  const [amocrmWebhookUrl, setAmocrmWebhookUrl] = useState<string | null>(null);
  const [bitrix24Info, setBitrix24Info] = useState<{ webhook_url: string; application_token: string | null } | null>(null);

  // Read the OAuth callback's ?connected=/?oauth_error= query params (same
  // parse-off-the-redirect pattern as NewPasswordView's password-reset deep
  // link) -- the backend's GET /crm/oauth/{provider}/callback redirects the
  // browser back here after completing the exchange.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const oauthError = params.get("oauth_error");
    if (connected) {
      toast.success(t.oauthConnectedToast);
    } else if (oauthError) {
      toast.error(t.oauthErrorToast);
    }
    if (connected || oauthError) {
      params.delete("connected");
      params.delete("oauth_error");
      const query = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (query ? `?${query}` : ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    if (!accessToken || !canView) return;
    setError(null);
    try {
      const [integrationsData, campaignsData] = await Promise.all([
        crmApi.listIntegrations(accessToken),
        crmApi.listAdCampaigns(accessToken),
      ]);
      setIntegrations(integrationsData);
      setCampaigns(campaignsData);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.loadError);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Live-updating leads list (2026-07-17) -- a webhook-pushed lead used to
  // stay invisible on this page until a manual reload, since listLeads was
  // only ever fetched once on mount. subscribeLeads keeps an SSE connection
  // open (same poll-and-push shape as the leaderboard) and replaces `leads`
  // on every tick, so a new lead shows up within one poll interval instead.
  useEffect(() => {
    if (!accessToken || !canView) return;
    const unsubscribe = crmApi.subscribeLeads(accessToken, (entries) => setLeads(entries));
    return unsubscribe;
  }, [accessToken, canView]);

  const amocrmConnected = integrations.some((i) => i.provider === "amocrm" && i.is_active);
  const bitrix24Connected = integrations.some((i) => i.provider === "bitrix24" && i.is_active);
  const metaAdsConnected = integrations.some((i) => i.provider === "meta_ads" && i.is_active);

  // Once connected (by either method -- manual paste or 1-click OAuth),
  // fetch the tenant's own webhook URL to show instead of the connect UI --
  // admin/employees no longer need DB access to find it (2026-07-16).
  useEffect(() => {
    if (!accessToken || !amocrmConnected) {
      setAmocrmWebhookUrl(null);
      return;
    }
    crmApi
      .getWebhookUrl(accessToken, "amocrm")
      .then((r) => setAmocrmWebhookUrl(r.webhook_url))
      .catch(() => setAmocrmWebhookUrl(null));
  }, [accessToken, amocrmConnected]);

  // Same treatment for bitrix24 (2026-07-17) -- also retrievable after a
  // manual configure now (not just shown once), so this same effect covers
  // both connect paths and page reloads.
  useEffect(() => {
    if (!accessToken || !bitrix24Connected) {
      setBitrix24Info(null);
      return;
    }
    crmApi
      .getWebhookUrl(accessToken, "bitrix24")
      .then((r) => setBitrix24Info(r))
      .catch(() => setBitrix24Info(null));
  }, [accessToken, bitrix24Connected]);

  async function handleOAuthConnect(provider: OAuthProvider) {
    if (!accessToken) return;
    const domain = oauthDomain[provider]?.trim();
    // amocrm's authorize step is domain-agnostic (2026-07-15, confirmed
    // against a real registered integration) -- only bitrix24's authorize
    // host is actually subdomain-specific and needs it upfront.
    if (provider === "bitrix24" && !domain) {
      toast.error(t.oneClickDomainRequired);
      return;
    }
    setOauthConnecting(provider);
    try {
      const { authorize_url } = await crmApi.getOAuthAuthorizeUrl(accessToken, provider, domain);
      // Navigate the whole tab to the provider's own consent screen -- it
      // redirects back to our backend's callback, which then redirects here.
      window.location.assign(authorize_url);
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 400 ? t.oneClickNotConfigured : t.genericError);
      setOauthConnecting(null);
    }
  }

  async function handleConfigure(provider: "amocrm" | "bitrix24" | "meta_ads", values: Record<string, string>) {
    if (!accessToken) return;
    try {
      let integration: CrmIntegration;
      if (provider === "amocrm") {
        integration = await crmApi.configureAmoCrm(accessToken, {
          subdomain: values.subdomain,
          api_token: values.api_token,
          webhook_secret: values.webhook_secret,
        });
      } else if (provider === "bitrix24") {
        integration = await crmApi.configureBitrix24(accessToken, { webhook_base_url: values.webhook_base_url });
      } else {
        integration = await crmApi.configureMetaAds(accessToken, {
          ad_account_id: values.ad_account_id,
          access_token: values.access_token,
        });
      }
      setIntegrations((prev) => [...prev.filter((i) => i.provider !== integration.provider), integration]);
      toast.success(t.connectedToast);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        toast.error(t.need2fa);
      } else if (provider === "bitrix24" && err instanceof ApiError && err.status === 400) {
        toast.error(t.invalidWebhookUrl);
      } else {
        toast.error(t.genericError);
      }
    }
  }

  // Disconnect (2026-07-17) -- IntegrationCard's own onDisconnect prop calls
  // straight through with no confirmation step, so this just opens a shared
  // ConfirmDialog instead of disconnecting immediately; the real API call
  // happens in handleConfirmDisconnect below, once the admin actually
  // confirms. Soft-deactivates (backend keeps the row, doesn't delete it) so
  // a later reconnect can reuse the same webhook secret.
  const [disconnectTarget, setDisconnectTarget] = useState<OAuthProvider | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleConfirmDisconnect() {
    if (!accessToken || !disconnectTarget) return;
    setDisconnecting(true);
    try {
      await crmApi.disconnectIntegration(accessToken, disconnectTarget);
      toast.success(t.disconnected);
      setDisconnectTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : t.genericError);
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <h1 className="font-heading mb-1 text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
        <p className="text-sm text-foreground-muted">{t.sub}</p>
      </div>

      {!has2fa && (
        <div className="border-primary/25 bg-primary/8 mb-6 flex items-center gap-3 rounded-2xl border p-4">
          <span className="flex-1 text-sm text-foreground">{t.need2fa}</span>
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <IntegrationCard
            icon={Workflow}
            brandColor="#2FBF71"
            name="AmoCRM"
            connected={amocrmConnected}
            connectLabel={t.connect}
            connectedLabel={t.connected}
            editLabel={t.edit}
            submitLabel={t.save}
            fields={[
              { key: "subdomain", label: t.subdomain, placeholder: "mycompany" },
              { key: "api_token", label: t.apiToken, secret: true },
              { key: "webhook_secret", label: t.webhookSecret, secret: true },
            ]}
            onSubmit={(values) => handleConfigure("amocrm", values)}
            connectedInfo={
              amocrmWebhookUrl && <CopyBox hint={t.webhookUrlHint} label={t.webhookUrlTitle} value={amocrmWebhookUrl} secret />
            }
            onDisconnect={amocrmConnected ? () => Promise.resolve(setDisconnectTarget("amocrm")) : undefined}
            disconnectLabel={t.disconnect}
            readOnly={!canManage}
          />
          {canManage && !amocrmConnected && (
            <OneClickConnectRow
              provider="amocrm"
              needsDomain={false}
              domain={oauthDomain.amocrm ?? ""}
              onDomainChange={(value) => setOauthDomain((prev) => ({ ...prev, amocrm: value }))}
              connecting={oauthConnecting === "amocrm"}
              onConnect={() => handleOAuthConnect("amocrm")}
              label={t.oneClickConnect}
              domainPlaceholder={t.oneClickDomainPlaceholder}
            />
          )}
        </div>
        <div>
          <IntegrationCard
            icon={Building2}
            brandColor="#4C6FFF"
            name="Bitrix24"
            connected={bitrix24Connected}
            connectLabel={t.connect}
            connectedLabel={t.connected}
            editLabel={t.edit}
            submitLabel={t.save}
            fields={[
              { key: "webhook_base_url", label: t.webhookUrl, placeholder: "https://mycompany.bitrix24.ru/rest/1/xxx" },
            ]}
            onSubmit={(values) => handleConfigure("bitrix24", values)}
            connectedInfo={
              bitrix24Info && (
                <>
                  <CopyBox hint={t.bitrixWebhookUrlHint} label={t.webhookUrlTitle} value={bitrix24Info.webhook_url} secret />
                  {bitrix24Info.application_token && (
                    <CopyBox hint={t.bitrixTokenHint} label={t.appToken} value={bitrix24Info.application_token} secret />
                  )}
                </>
              )
            }
            onDisconnect={bitrix24Connected ? () => Promise.resolve(setDisconnectTarget("bitrix24")) : undefined}
            disconnectLabel={t.disconnect}
            readOnly={!canManage}
          />
          {canManage && !bitrix24Connected && (
            <OneClickConnectRow
              provider="bitrix24"
              needsDomain
              domain={oauthDomain.bitrix24 ?? ""}
              onDomainChange={(value) => setOauthDomain((prev) => ({ ...prev, bitrix24: value }))}
              connecting={oauthConnecting === "bitrix24"}
              onConnect={() => handleOAuthConnect("bitrix24")}
              label={t.oneClickConnect}
              domainPlaceholder={t.oneClickDomainPlaceholder}
            />
          )}
        </div>
        <div>
          <IntegrationCard
            icon={Megaphone}
            brandColor="#F97316"
            name="Meta Ads"
            connected={metaAdsConnected}
            connectLabel={t.connect}
            connectedLabel={t.connected}
            editLabel={t.edit}
            submitLabel={t.save}
            fields={[
              { key: "ad_account_id", label: t.adAccountId, placeholder: "act_1234567890" },
              { key: "access_token", label: t.accessToken, secret: true },
            ]}
            onSubmit={(values) => handleConfigure("meta_ads", values)}
            onDisconnect={metaAdsConnected ? () => Promise.resolve(setDisconnectTarget("meta_ads")) : undefined}
            disconnectLabel={t.disconnect}
            readOnly={!canManage}
          />
          {canManage && !metaAdsConnected && (
            <OneClickConnectRow
              provider="meta_ads"
              needsDomain={false}
              domain=""
              onDomainChange={() => {}}
              connecting={oauthConnecting === "meta_ads"}
              onConnect={() => handleOAuthConnect("meta_ads")}
              label={t.oneClickConnect}
              domainPlaceholder={t.oneClickDomainPlaceholder}
            />
          )}
        </div>
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

      {canView && (
        <>
          {error && (
            <div className="glass-card flex flex-col items-center gap-3 p-10 text-center">
              <AlertCircle size={28} className="text-destructive" />
              <p className="text-sm text-foreground-muted">{error}</p>
            </div>
          )}

          {!error && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <h2 className="font-heading mb-3 text-base font-bold text-foreground">{t.leadsTitle}</h2>
                {leads === null ? (
                  <div className="flex justify-center py-10">
                    <Loader2 size={22} className="text-primary animate-spin" />
                  </div>
                ) : leads.length === 0 ? (
                  <p className="glass-card py-8 text-center text-sm text-foreground-muted">{t.noLeads}</p>
                ) : (
                  <div className="glass-card overflow-hidden p-0">
                    {leads.map((lead, i) => (
                      <div
                        key={lead.id}
                        className={`flex items-center justify-between gap-3 p-3.5 text-sm ${
                          i < leads.length - 1 ? "border-b border-card-border/60" : ""
                        }`}
                      >
                        <span className="text-foreground-muted capitalize">{lead.provider}</span>
                        <span className="text-foreground-muted text-xs">{lead.direction}</span>
                        <span className="text-xs text-foreground-muted">{new Date(lead.synced_at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h2 className="font-heading mb-3 text-base font-bold text-foreground">{t.campaignsTitle}</h2>
                {campaigns === null ? (
                  <div className="flex justify-center py-10">
                    <Loader2 size={22} className="text-primary animate-spin" />
                  </div>
                ) : campaigns.length === 0 ? (
                  <p className="glass-card py-8 text-center text-sm text-foreground-muted">{t.noCampaigns}</p>
                ) : (
                  <div className="glass-card overflow-hidden p-0">
                    {campaigns.map((c, i) => (
                      <div
                        key={c.id}
                        className={`flex items-center justify-between gap-3 p-3.5 text-sm ${
                          i < campaigns.length - 1 ? "border-b border-card-border/60" : ""
                        }`}
                      >
                        <span className="truncate text-foreground">{c.name}</span>
                        <span className="text-xs text-foreground-muted capitalize">{c.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
