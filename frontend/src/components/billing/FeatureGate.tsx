import type { ReactNode } from "react";
import { Link } from "react-router";
import { Lock } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useEntitlements } from "@/lib/billing/EntitlementsContext";

const content = {
  uz: {
    title: "Bu funksiya tarifingizda mavjud emas",
    sub: "Ushbu bo'limdan foydalanish uchun tarifingizni yangilang.",
    cta: "Tariflarni ko'rish",
  },
  ru: {
    title: "Эта функция недоступна на вашем тарифе",
    sub: "Чтобы использовать этот раздел, обновите тариф.",
    cta: "Посмотреть тарифы",
  },
};

// Blocks a whole page's content behind an upsell card when the tenant's
// current plan doesn't include `feature` -- mirrors the "2FA required"
// blocking-card pattern already used on PlatformBackupSettingsView/
// PlatformBillingPlansPage. The actual API endpoints are already gated
// server-side (billing/deps.py's require_plan_feature); this is the UI half.
export function FeatureGate({ feature, children }: { feature: string | string[]; children: ReactNode }) {
  const { lang } = useLang();
  const t = content[lang];
  const { hasFeature } = useEntitlements();

  // Array = "any of these unlocks the page" (e.g. Integrations covers both
  // CRM and Meta Ads -- either one is enough to show the real content).
  const unlocked = Array.isArray(feature) ? feature.some(hasFeature) : hasFeature(feature);
  if (unlocked) return <>{children}</>;

  return (
    <main className="mx-auto max-w-[520px] px-4 py-16 text-center">
      <div className="glass-card p-8">
        <div className="border-primary/25 bg-primary/12 mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl border">
          <Lock size={22} className="text-primary" />
        </div>
        <h2 className="font-heading mb-2 text-lg font-bold text-foreground">{t.title}</h2>
        <p className="text-foreground-muted mb-6 text-sm">{t.sub}</p>
        <Link
          to="/dashboard/settings/billing"
          className="gold-gradient-bg inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-[#0A0E1A]"
        >
          {t.cta}
        </Link>
      </div>
    </main>
  );
}
