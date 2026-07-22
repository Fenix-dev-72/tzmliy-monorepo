import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as tenantAuthApi from "@/lib/api/tenantAuth";
import { OtpCodeInput } from "@/components/auth/OtpCodeInput";
import { Button } from "@/components/ui/button";
import { PasswordChangeCard } from "./PasswordChangeCard";
import { ProfileSettingsCard } from "./ProfileSettingsCard";
import { KioskDashboardsCard } from "./KioskDashboardsCard";

const content = {
  uz: {
    pageTitle: "Sozlamalar",
    title: "Ikki faktorli tasdiqlash (2FA)",
    sub: "Google Authenticator yoki Authy ilovasi bilan QR kodni skanerlang, so'ng kodni kiriting.",
    secretLabel: "Yoki qo'lda kiriting:",
    btn: "Tasdiqlash",
    loading: "Yuklanmoqda...",
    error: "Kod noto'g'ri",
    loadError: "QR kod yuklanmadi, sahifani yangilang",
    enabledTitle: "2FA yoqilgan",
    enabledDesc: "Hisobingiz ikki faktorli tasdiqlash bilan himoyalangan. Endi to'lov qabul qilish, bonus rejalar va boshqa imtiyozli amallar mavjud.",
    whyTitle: "Nega kerak?",
    whyDesc: "To'lov qabul qilish, bonus/payroll hisoblash va boshqa moliyaviy amallar faqat 2FA yoqilgan hisoblarga ruxsat beriladi.",
  },
  ru: {
    pageTitle: "Настройки",
    title: "Двухфакторная аутентификация (2FA)",
    sub: "Отсканируйте QR-код в Google Authenticator или Authy, затем введите код.",
    secretLabel: "Или введите вручную:",
    btn: "Подтвердить",
    loading: "Загрузка...",
    error: "Неверный код",
    loadError: "Не удалось загрузить QR-код, обновите страницу",
    enabledTitle: "2FA включена",
    enabledDesc: "Ваш аккаунт защищён двухфакторной аутентификацией. Теперь доступны приём платежей, бонусные планы и другие привилегированные действия.",
    whyTitle: "Зачем это нужно?",
    whyDesc: "Приём платежей, расчёт бонусов/зарплаты и другие финансовые действия доступны только аккаунтам с включённой 2FA.",
  },
};

export function TwoFactorSettingsPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken, user, refreshSession } = useTenantAuth();

  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justEnabled, setJustEnabled] = useState(false);
  const setupRequested = useRef(false);

  const alreadyEnabled = Boolean(user?.totp_enabled) || justEnabled;
  const canManageDashboards = (user?.permissions ?? []).includes("analytics.manage");

  useEffect(() => {
    // Must wait for `user` to actually load, not just `accessToken` -- the
    // auth store sets accessToken synchronously but fetches /auth/me
    // asynchronously, so there's a render where accessToken is truthy and
    // user is still null. Without this guard, alreadyEnabled reads false for
    // an already-2FA-enabled account during that window and this effect
    // fires /2fa/setup prematurely -- previously a real bug, since the
    // backend used to reset totp_enabled to false as a side effect of that
    // call, silently disabling 2FA every time this page was hit early.
    if (!accessToken || !user || alreadyEnabled || setupRequested.current) return;
    setupRequested.current = true;
    tenantAuthApi
      .setup2fa(accessToken)
      .then((res) => {
        setOtpauthUri(res.otpauth_uri);
        setSecret(res.secret);
      })
      .catch(() => setError(t.loadError));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, user, alreadyEnabled]);

  async function handleConfirm(submittedCode: string) {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      await tenantAuthApi.confirm2fa(accessToken, submittedCode);
      await refreshSession();
      setJustEnabled(true);
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="font-heading mb-6 text-xl font-extrabold text-foreground sm:mb-8 sm:text-2xl">{t.pageTitle}</h1>

      <div className="mb-8">
        <ProfileSettingsCard />
      </div>

      <div className="mb-8">
        <PasswordChangeCard />
      </div>

      <div className="mb-6 sm:mb-8">
        <h2 className="font-heading mb-1 text-lg font-bold text-foreground">{t.title}</h2>
        {!alreadyEnabled && <p className="text-sm text-foreground-muted">{t.whyDesc}</p>}
      </div>

      {alreadyEnabled ? (
        <div className="glass-card auth-card-enter flex flex-col items-center gap-3 p-10 text-center">
          <div className="border-success/25 bg-success/12 flex size-14 items-center justify-center rounded-2xl border">
            <CheckCircle2 size={26} className="text-success" />
          </div>
          <h2 className="font-heading text-lg font-bold text-foreground">{t.enabledTitle}</h2>
          <p className="max-w-sm text-sm text-foreground-muted">{t.enabledDesc}</p>
        </div>
      ) : (
        <div className="glass-card p-6 text-center sm:p-8">
          <div className="border-primary/25 bg-primary/12 mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl border">
            <ShieldCheck size={26} className="text-primary" />
          </div>
          <p className="mx-auto mb-6 max-w-[320px] text-sm leading-relaxed text-foreground-muted">{t.sub}</p>

          {otpauthUri ? (
            <div className="mx-auto mb-3 w-fit rounded-2xl bg-white p-4">
              <QRCodeSVG value={otpauthUri} size={180} />
            </div>
          ) : (
            <div className="mb-3 flex justify-center py-10">
              <Loader2 size={24} className="text-primary animate-spin" />
            </div>
          )}

          {secret && (
            <p className="font-mono mb-7 text-xs break-all text-foreground-muted">
              {t.secretLabel} {secret}
            </p>
          )}

          <OtpCodeInput value={code} onChange={setCode} onComplete={handleConfirm} />

          {error && <p className="text-destructive mt-4 text-[13px] font-medium">{error}</p>}

          <Button
            variant="gold"
            size="lg"
            className="mt-6 w-full"
            disabled={code.length < 6 || loading || !otpauthUri}
            onClick={() => handleConfirm(code)}
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? t.loading : t.btn}
          </Button>
        </div>
      )}

      {canManageDashboards && alreadyEnabled && (
        <div className="mt-8">
          <KioskDashboardsCard />
        </div>
      )}
    </main>
  );
}
