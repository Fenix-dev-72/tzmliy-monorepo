"""Fixed catalog of plan-gated feature keys, mirrors auth/permissions.py's
shape but for billing-plan entitlements rather than RBAC. A plan's
feature_keys (billing_plans.feature_keys) is a subset of ALL_FEATURE_KEYS,
fully controlled by the Platform Admin via /platform/billing-plans -- adding
a new gated capability means adding a key here and wiring require_plan_feature
onto its router, same as adding a new RBAC permission."""

FEATURE_CRM_INTEGRATIONS = "crm_integrations"
FEATURE_META_ADS = "meta_ads"
FEATURE_TELEGRAM_NOTIFICATIONS = "telegram_notifications"
FEATURE_ADVANCED_REPORTS = "advanced_reports"

ALL_FEATURE_KEYS = [
    FEATURE_CRM_INTEGRATIONS,
    FEATURE_META_ADS,
    FEATURE_TELEGRAM_NOTIFICATIONS,
    FEATURE_ADVANCED_REPORTS,
]
