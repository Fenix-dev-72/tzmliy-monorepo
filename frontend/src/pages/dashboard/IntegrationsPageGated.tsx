import { FeatureGate } from "@/components/billing/FeatureGate";
import { FEATURE_CRM_INTEGRATIONS, FEATURE_META_ADS } from "@/lib/billing/features";
import { IntegrationsPage } from "./IntegrationsPage";

export function IntegrationsPageGated() {
  return (
    <FeatureGate feature={[FEATURE_CRM_INTEGRATIONS, FEATURE_META_ADS]}>
      <IntegrationsPage />
    </FeatureGate>
  );
}
