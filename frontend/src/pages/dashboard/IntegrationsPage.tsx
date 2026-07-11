import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Building2, Loader2, Megaphone, Workflow } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as crmApi from "@/lib/api/crm";
import type { AdCampaign, CrmIntegration, CrmLeadSync } from "@/lib/api/crm";
import { ApiError } from "@/lib/api/client";
import { IntegrationCard } from "@/components/shared/IntegrationCard";

const content = {
  uz: {
    title: "Integratsiyalar",
    sub: "Tashqi CRM va reklama tizimlarini ulash",
    connect: "Ulash",
    connected: "Ulangan",
    save: "Saqlash",
    need2fa: "Integratsiya sozlash uchun 2FA yoqilgan bo'lishi kerak.",
    genericError: "Xatolik yuz berdi",
    connectedToast: "Integratsiya ulandi",
    subdomain: "Subdomen",
    apiToken: "API token",
    webhookSecret: "Webhook maxfiy kaliti",
    webhookUrl: "Webhook bazaviy URL",
    appToken: "Ilova tokeni",
    adAccountId: "Reklama hisob ID",
    accessToken: "Access token",
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
    save: "Сохранить",
    need2fa: "Для настройки интеграции требуется включённая 2FA.",
    genericError: "Произошла ошибка",
    connectedToast: "Интеграция подключена",
    subdomain: "Поддомен",
    apiToken: "API токен",
    webhookSecret: "Секрет вебхука",
    webhookUrl: "Базовый URL вебхука",
    appToken: "Токен приложения",
    adAccountId: "ID рекламного аккаунта",
    accessToken: "Access token",
    leadsTitle: "История лидов",
    noLeads: "Синхронизированных лидов пока нет",
    campaignsTitle: "Рекламные кампании",
    noCampaigns: "Кампаний пока нет",
    loadError: "Не удалось загрузить данные",
  },
};

export function IntegrationsPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { user } = useTenantAuth();
  const accessToken = useTenantAuth().accessToken;
  const has2fa = Boolean(user?.totp_enabled);
  const canView = (user?.permissions ?? []).includes("crm.view");

  const [integrations, setIntegrations] = useState<CrmIntegration[]>([]);
  const [leads, setLeads] = useState<CrmLeadSync[] | null>(null);
  const [campaigns, setCampaigns] = useState<AdCampaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!accessToken || !canView) return;
    setError(null);
    try {
      const [leadsData, campaignsData] = await Promise.all([
        crmApi.listLeads(accessToken),
        crmApi.listAdCampaigns(accessToken),
      ]);
      setLeads(leadsData);
      setCampaigns(campaignsData);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.loadError);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

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
        integration = await crmApi.configureBitrix24(accessToken, {
          webhook_base_url: values.webhook_base_url,
          application_token: values.application_token,
        });
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
      toast.error(err instanceof ApiError && err.status === 403 ? t.need2fa : t.genericError);
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
        <IntegrationCard
          icon={Workflow}
          brandColor="#2FBF71"
          name="AmoCRM"
          connected={integrations.some((i) => i.provider === "amocrm" && i.is_active)}
          connectLabel={t.connect}
          connectedLabel={t.connected}
          submitLabel={t.save}
          fields={[
            { key: "subdomain", label: t.subdomain, placeholder: "mycompany" },
            { key: "api_token", label: t.apiToken, secret: true },
            { key: "webhook_secret", label: t.webhookSecret, secret: true },
          ]}
          onSubmit={(values) => handleConfigure("amocrm", values)}
        />
        <IntegrationCard
          icon={Building2}
          brandColor="#4C6FFF"
          name="Bitrix24"
          connected={integrations.some((i) => i.provider === "bitrix24" && i.is_active)}
          connectLabel={t.connect}
          connectedLabel={t.connected}
          submitLabel={t.save}
          fields={[
            { key: "webhook_base_url", label: t.webhookUrl, placeholder: "https://mycompany.bitrix24.ru/rest/1/xxx" },
            { key: "application_token", label: t.appToken, secret: true },
          ]}
          onSubmit={(values) => handleConfigure("bitrix24", values)}
        />
        <IntegrationCard
          icon={Megaphone}
          brandColor="#D4AF37"
          name="Meta Ads"
          connected={integrations.some((i) => i.provider === "meta_ads" && i.is_active)}
          connectLabel={t.connect}
          connectedLabel={t.connected}
          submitLabel={t.save}
          fields={[
            { key: "ad_account_id", label: t.adAccountId, placeholder: "act_1234567890" },
            { key: "access_token", label: t.accessToken, secret: true },
          ]}
          onSubmit={(values) => handleConfigure("meta_ads", values)}
        />
      </div>

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
