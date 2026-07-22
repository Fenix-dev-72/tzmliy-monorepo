USERS_VIEW = "users.view"
USERS_MANAGE = "users.manage"
ROLES_VIEW = "roles.view"
ROLES_MANAGE = "roles.manage"
CATALOG_VIEW = "catalog.view"
CATALOG_MANAGE = "catalog.manage"
CUSTOMERS_VIEW = "customers.view"
CUSTOMERS_VIEW_ALL = "customers.view_all"
CUSTOMERS_MANAGE = "customers.manage"
SALES_VIEW = "sales.view"
SALES_VIEW_ALL = "sales.view_all"
SALES_MANAGE = "sales.manage"
FINANCE_VIEW = "finance.view"
FINANCE_VIEW_ALL = "finance.view_all"
FINANCE_MANAGE = "finance.manage"
FINANCE_APPROVE = "finance.approve"
CALLS_VIEW = "calls.view"
CALLS_VIEW_ALL = "calls.view_all"
CALLS_MANAGE = "calls.manage"
ATTENDANCE_VIEW = "attendance.view"
ATTENDANCE_MANAGE = "attendance.manage"
BILLING_VIEW = "billing.view"
BILLING_MANAGE = "billing.manage"
NOTIFICATIONS_VIEW = "notifications.view"
NOTIFICATIONS_MANAGE = "notifications.manage"
ANALYTICS_VIEW = "analytics.view"
ANALYTICS_MANAGE = "analytics.manage"
CRM_VIEW = "crm.view"
CRM_MANAGE = "crm.manage"
REPORTS_VIEW = "reports.view"
REPORTS_EXPORT = "reports.export"

ALL_PERMISSIONS: frozenset[str] = frozenset(
    {
        USERS_VIEW,
        USERS_MANAGE,
        ROLES_VIEW,
        ROLES_MANAGE,
        CATALOG_VIEW,
        CATALOG_MANAGE,
        CUSTOMERS_VIEW,
        CUSTOMERS_VIEW_ALL,
        CUSTOMERS_MANAGE,
        SALES_VIEW,
        SALES_VIEW_ALL,
        SALES_MANAGE,
        FINANCE_VIEW,
        FINANCE_VIEW_ALL,
        FINANCE_MANAGE,
        FINANCE_APPROVE,
        CALLS_VIEW,
        CALLS_VIEW_ALL,
        CALLS_MANAGE,
        ATTENDANCE_VIEW,
        ATTENDANCE_MANAGE,
        BILLING_VIEW,
        BILLING_MANAGE,
        NOTIFICATIONS_VIEW,
        NOTIFICATIONS_MANAGE,
        ANALYTICS_VIEW,
        ANALYTICS_MANAGE,
        CRM_VIEW,
        CRM_MANAGE,
        REPORTS_VIEW,
        REPORTS_EXPORT,
    }
)

# Seeded once per tenant when it's created (see roles_service.seed_default_roles).
# Tenant Admin can create further custom roles (OnlineAgent, OfflineAgent, ...)
# with any subset of ALL_PERMISSIONS — these four are just the starting point.
#
# Adding a key here only affects *new* tenants — existing tenants' system
# roles need a data-migration backfill (see the migration that introduces
# the new permission, e.g. 0006_catalog.sql) to actually grant it.
# Permissions that can move money, grant access, or approve financial changes.
# require_permission() (core/deps.py) blocks these unless the caller's 2FA is
# enabled, per the TZ's "privileged rollar uchun 2FA" requirement.
PRIVILEGED_PERMISSIONS: frozenset[str] = frozenset(
    {
        USERS_MANAGE,
        ROLES_MANAGE,
        FINANCE_MANAGE,
        FINANCE_APPROVE,
        CALLS_MANAGE,
        BILLING_MANAGE,
        NOTIFICATIONS_MANAGE,
        ANALYTICS_MANAGE,
        CRM_MANAGE,
        REPORTS_EXPORT,
    }
)

# "view" vs "view_all" (2026-07-22, explicit client request: "har bir xodim faqat
# o'zinikini ko'rsin, faqat admin ruxsat bergan narsalar ko'rsatiladi"): plain
# `customers.view`/`sales.view`/`calls.view`/`finance.view` now mean "list/get
# endpoints return only rows the caller owns" (responsible_user_id/
# created_by_user_id = caller — see each module's repository.py for the exact
# filter). The matching `*_view_all` key removes that row-level filter and
# restores today's "see every tenant row" behavior. Deliberately NOT in
# PRIVILEGED_PERMISSIONS (unlike e.g. reports.export) -- gating it on 2FA
# would newly lock admin accounts without 2FA set up out of data they could
# already see before this change, which is a bigger regression than the
# broader-visibility risk itself.
DEFAULT_ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    "admin": ALL_PERMISSIONS,
    "manager": frozenset(
        {
            USERS_VIEW,
            CATALOG_VIEW,
            CUSTOMERS_VIEW,
            CUSTOMERS_MANAGE,
            SALES_VIEW,
            SALES_MANAGE,
            FINANCE_VIEW,
            CALLS_VIEW,
            ATTENDANCE_VIEW,
            BILLING_VIEW,
            NOTIFICATIONS_VIEW,
            ANALYTICS_VIEW,
            CRM_VIEW,
        }
    ),
    "finance": frozenset(
        {
            USERS_VIEW,
            CUSTOMERS_VIEW,
            SALES_VIEW,
            FINANCE_VIEW,
            FINANCE_MANAGE,
            FINANCE_APPROVE,
            BILLING_VIEW,
            BILLING_MANAGE,
            NOTIFICATIONS_VIEW,
            ANALYTICS_VIEW,
        }
    ),
    "agent": frozenset(
        {
            CATALOG_VIEW,
            CUSTOMERS_VIEW,
            CUSTOMERS_MANAGE,
            SALES_VIEW,
            SALES_MANAGE,
            CALLS_VIEW,
            ANALYTICS_VIEW,
            CRM_VIEW,
        }
    ),
}
