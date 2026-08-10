import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Building2, Loader2, Megaphone, Workflow, Zap } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as crmApi from "@/lib/api/crm";
import type { AdCampaign, CrmIntegration, CrmLeadSync, ManagerCandidate, OAuthProvider } from "@/lib/api/crm";
import { ApiError } from "@/lib/api/client";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { DashboardPageContainer } from "@/components/shared/DashboardPageContainer";
import { PaginationBar } from "@/components/shared/PaginationBar";
import { AD_CAMPAIGNS_PAGE_SIZE } from "@/lib/api/crm";

// Leads come from a live SSE feed (server caps it at 100 most-recent rows,
// not a paginated endpoint) -- 7 per "page" is client-side windowing over
// that already-bounded array, not a server round trip.
const LEADS_PAGE_SIZE = 7;

const content = {
  uz: {
    title: "Integratsiyalar",
    sub: "Tashqi CRM va reklama tizimlarini ulash",
    connect: "Ulash",
    connected: "Ulangan",
    edit: "Tahrirlash",
    disconnect: "Uzish",
    disconnectConfirm: "Bu integratsiyani uzishga ishonchingiz komilmi? Yangi ma'lumotlar sinxronlanishi to'xtaydi.",
    disconnected: "Integratsiya uzildi",
    cancel: "Bekor qilish",
    save: "Saqlash",
    need2fa: "Integratsiya sozlash uchun 2FA yoqilgan bo'lishi kerak.",
    need2faToast: "Integratsiya ulash uchun avval 2FA yoqilishi kerak",
    genericError: "Xatolik yuz berdi",
    connectedToast: "Integratsiya ulandi",
    oneClickConnect: "Ulash",
    oneClickDomainPlaceholder: "subdomen (masalan: mycompany)",
    oneClickNotConfigured: "Bu integratsiya uchun OAuth hali sozlanmagan",
    oneClickDomainRequired: "Iltimos, subdomenni kiriting",
    oauthConnectedToast: "Muvaffaqiyatli ulandi (OAuth)",
    oauthErrorToast: "OAuth orqali ulashda xatolik yuz berdi",
    linkManagerToggle: "O'zingizni ulash",
    linkManagerBtn: "Ulash",
    pickYourself: "O'zingizni tanlang",
    managerLinked: "Bog'landi",
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
    disconnectConfirm: "Точно отключить эту интеграцию? Новые данные перестанут синхронизироваться.",
    disconnected: "Интеграция отключена",
    cancel: "Отмена",
    save: "Сохранить",
    need2fa: "Для настройки интеграции требуется включённая 2FA.",
    need2faToast: "Для подключения интеграции сначала включите 2FA",
    genericError: "Произошла ошибка",
    connectedToast: "Интеграция подключена",
    oneClickConnect: "Подключить",
    oneClickDomainPlaceholder: "поддомен (например: mycompany)",
    oneClickNotConfigured: "OAuth для этой интеграции ещё не настроен",
    oneClickDomainRequired: "Пожалуйста, введите поддомен",
    oauthConnectedToast: "Успешно подключено (OAuth)",
    oauthErrorToast: "Ошибка при подключении через OAuth",
    linkManagerToggle: "Подключить себя",
    linkManagerBtn: "Подключить",
    pickYourself: "Выберите себя",
    managerLinked: "Подключено",
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
    <div className="mt-3 flex items-center gap-1.5" data-provider={provider}>
      {needsDomain && (
        <input
          value={domain}
          onChange={(e) => onDomainChange(e.target.value)}
          placeholder={domainPlaceholder}
          className="border-card-border bg-input-background text-foreground placeholder:text-foreground-muted h-9 min-w-0 flex-1 rounded-lg border px-3 text-xs outline-none"
        />
      )}
      <Button variant="outline" size="sm" disabled={connecting} onClick={onConnect} className="shrink-0">
        {connecting ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
        {label}
      </Button>
    </div>
  );
}

// Self-service "link my own CRM identity" (2026-07-24) -- previously only
// reachable via CompleteSetupPage's onboarding gate, which is driven by
// user.pending_links, a single flag NOT per-provider: once an employee links
// ANY one CRM provider, "crm" drops off pending_links entirely, silently
// hiding the option to also link a SECOND connected provider (a tenant using
// both AmoCRM and Bitrix24 at once). This lives here instead, permanently
// available per connected provider, not gated on pending_links at all.
function ManagerLinkWidget({
  provider,
  accessToken,
  t,
}: {
  provider: "amocrm" | "bitrix24";
  accessToken: string;
  t: (typeof content)["uz"];
}) {
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<ManagerCandidate[] | null>(null);
  const [selected, setSelected] = useState("");
  const [linking, setLinking] = useState(false);

  async function handleOpen() {
    setOpen(true);
    if (candidates !== null) return;
    try {
      setCandidates(await crmApi.listManagerCandidates(accessToken, provider));
    } catch {
      setCandidates([]);
    }
  }

  async function handleLink() {
    if (!selected) return;
    setLinking(true);
    try {
      await crmApi.createOwnManagerMapping(accessToken, { provider, external_manager_id: selected });
      toast.success(t.managerLinked);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : t.genericError);
    } finally {
      setLinking(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={handleOpen} className="text-primary mt-3 text-xs font-medium hover:underline">
        {t.linkManagerToggle}
      </button>
    );
  }

  return (
    <div className="border-card-border/60 mt-3 flex flex-col gap-2 border-t pt-3">
      {candidates === null ? (
        <Loader2 size={14} className="text-foreground-muted animate-spin" />
      ) : (
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="border-card-border bg-input-background text-foreground rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">{t.pickYourself}</option>
          {candidates.map((c) => (
            <option key={c.external_manager_id} value={c.external_manager_id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <Button variant="gold" size="sm" disabled={!selected || linking} onClick={handleLink}>
        {linking && <Loader2 size={14} className="animate-spin" />}
        {t.linkManagerBtn}
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
  // Leads come from a live SSE feed (server caps it at 100 most-recent rows,
  // not a paginated endpoint), so pagination here is client-side windowing
  // over that already-bounded array, not a server round trip.
  const [leadsPage, setLeadsPage] = useState(1);
  const [campaigns, setCampaigns] = useState<AdCampaign[] | null>(null);
  const [campaignsTotal, setCampaignsTotal] = useState(0);
  const [campaignsPage, setCampaignsPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [oauthDomain, setOauthDomain] = useState<Record<string, string>>({});
  const [oauthConnecting, setOauthConnecting] = useState<OAuthProvider | null>(null);

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

  async function load(targetCampaignsPage: number) {
    if (!accessToken || !canView) return;
    setError(null);
    try {
      const [integrationsData, campaignsData] = await Promise.all([
        crmApi.listIntegrations(accessToken),
        crmApi.listAdCampaigns(accessToken, AD_CAMPAIGNS_PAGE_SIZE, (targetCampaignsPage - 1) * AD_CAMPAIGNS_PAGE_SIZE),
      ]);
      setIntegrations(integrationsData);
      setCampaigns(campaignsData.items);
      setCampaignsTotal(campaignsData.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.loadError);
    }
  }

  useEffect(() => {
    load(campaignsPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, campaignsPage]);

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
      if (err instanceof ApiError && err.status === 400) {
        toast.error(t.oneClickNotConfigured);
      } else if (err instanceof ApiError && err.status === 403) {
        toast.error(t.need2faToast);
      } else {
        toast.error(t.genericError);
      }
      setOauthConnecting(null);
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
      await load(campaignsPage);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : t.genericError);
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <DashboardPageContainer>
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
          {/* AmoCRM is OAuth-only (2026-07-24, client decision) -- no manual
              subdomain/api_token paste option at all anymore, unlike
              Bitrix24/Meta Ads below. The "1 tugma bilan ulash" button is the
              entire connect flow: it alone opens AmoCRM's consent screen,
              and the backend's OAuth callback + sync_amocrm_leads worker
              handle everything else automatically from there. */}
          <div className="glass-card p-5 transition-all hover:-translate-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <div
                className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "#2FBF7118", color: "#2FBF71" }}
              >
                <Workflow size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-foreground">AmoCRM</div>
                <div className="flex items-center gap-1.5 text-xs text-foreground-muted">
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: amocrmConnected ? "#2FBF71" : "var(--card-border)" }}
                  />
                  <span className="truncate">{amocrmConnected ? t.connected : "—"}</span>
                </div>
              </div>
              {canManage && amocrmConnected && (
                <Button variant="outline" size="sm" onClick={() => setDisconnectTarget("amocrm")}>
                  {t.disconnect}
                </Button>
              )}
            </div>
            {amocrmConnected && accessToken && <ManagerLinkWidget provider="amocrm" accessToken={accessToken} t={t} />}
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
        </div>
        <div>
          {/* Bitrix24 is OAuth-only now too (2026-07-24, client decision --
              same treatment as AmoCRM above) -- no manual incoming-webhook
              URL paste option anymore. The "1 tugma bilan ulash" button
              (needsDomain, Bitrix24's authorize host is portal-specific)
              alone is the entire connect flow. */}
          <div className="glass-card p-5 transition-all hover:-translate-y-1">
            <div className="flex items-center gap-3">
              <div
                className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "#4C6FFF18", color: "#4C6FFF" }}
              >
                <Building2 size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-foreground">Bitrix24</div>
                <div className="flex items-center gap-1.5 text-xs text-foreground-muted">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: bitrix24Connected ? "#2FBF71" : "var(--card-border)" }}
                  />
                  {bitrix24Connected ? t.connected : "—"}
                </div>
              </div>
              {canManage && bitrix24Connected && (
                <Button variant="outline" size="sm" onClick={() => setDisconnectTarget("bitrix24")}>
                  {t.disconnect}
                </Button>
              )}
            </div>
            {bitrix24Connected && accessToken && <ManagerLinkWidget provider="bitrix24" accessToken={accessToken} t={t} />}
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
        </div>
        <div>
          {/* Meta Ads moved to OAuth-only (2026-07-24, client decision --
              same treatment as AmoCRM/Bitrix24 above): the ad account is now
              auto-discovered server-side (GET /me/adaccounts) right after
              connect, so the tenant never types act_{id} or pastes a raw
              access token by hand anymore. */}
          <div className="glass-card p-5 transition-all hover:-translate-y-1">
            <div className="flex items-center gap-3">
              <div
                className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "#F9731618", color: "#F97316" }}
              >
                <Megaphone size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-foreground">Meta Ads</div>
                <div className="flex items-center gap-1.5 text-xs text-foreground-muted">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: metaAdsConnected ? "#2FBF71" : "var(--card-border)" }}
                  />
                  {metaAdsConnected ? t.connected : "—"}
                </div>
              </div>
              {canManage && metaAdsConnected && (
                <Button variant="outline" size="sm" onClick={() => setDisconnectTarget("meta_ads")}>
                  {t.disconnect}
                </Button>
              )}
            </div>
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
                  <>
                    {/* Each lead is its own spaced card, not one continuous
                        divided list. Client-side pagination -- leads is a
                        live SSE feed already capped at 100 rows server-side,
                        not a paginated endpoint. */}
                    <div className="flex flex-col gap-2">
                      {leads.slice((leadsPage - 1) * LEADS_PAGE_SIZE, leadsPage * LEADS_PAGE_SIZE).map((lead) => (
                        <div key={lead.id} className="bg-card/95 border-card-border flex items-center justify-between gap-3 rounded-[14px] border p-3.5 text-sm shadow-sm">
                          <span className="text-foreground-muted capitalize">{lead.provider}</span>
                          <span className="text-foreground-muted text-xs">{lead.direction}</span>
                          <span className="text-xs text-foreground-muted">{new Date(lead.synced_at).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                    <PaginationBar page={leadsPage} totalPages={Math.ceil(leads.length / LEADS_PAGE_SIZE)} onChange={setLeadsPage} />
                  </>
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
                  <>
                    {/* Each campaign is its own spaced card, not one
                        continuous divided list. */}
                    <div className="flex flex-col gap-2">
                      {campaigns.map((c) => (
                        <div key={c.id} className="bg-card/95 border-card-border flex items-center justify-between gap-3 rounded-[14px] border p-3.5 text-sm shadow-sm">
                          <span className="truncate text-foreground">{c.name}</span>
                          <span className="text-xs text-foreground-muted capitalize">{c.status}</span>
                        </div>
                      ))}
                    </div>
                    <PaginationBar
                      page={campaignsPage}
                      totalPages={Math.ceil(campaignsTotal / AD_CAMPAIGNS_PAGE_SIZE)}
                      onChange={setCampaignsPage}
                    />
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </DashboardPageContainer>
  );
}
