import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as billingApi from "@/lib/api/billing";
import type { BillingEntitlements } from "@/lib/api/billing";

interface EntitlementsContextValue {
  entitlements: BillingEntitlements | null;
  hasFeature: (key: string) => boolean;
  refetch: () => void;
}

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);

// Single fetch per dashboard session (mounted once in DashboardLayout), read
// from anywhere via useEntitlements() -- backs the sidebar's lock/Premium
// badges and the /dashboard/settings/billing page. Unlike RBAC permissions
// (embedded in the JWT, cached until refresh), this is a live read every
// mount -- a plan change should be visible without forcing a re-login.
export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useTenantAuth();
  const [entitlements, setEntitlements] = useState<BillingEntitlements | null>(null);

  const refetch = useCallback(() => {
    if (!accessToken) return;
    billingApi.getEntitlements(accessToken).then(setEntitlements).catch(() => {});
  }, [accessToken]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const hasFeature = useCallback((key: string) => entitlements?.feature_keys.includes(key) ?? true, [entitlements]);

  return (
    <EntitlementsContext.Provider value={{ entitlements, hasFeature, refetch }}>
      {children}
    </EntitlementsContext.Provider>
  );
}

export function useEntitlements() {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) throw new Error("useEntitlements must be used within EntitlementsProvider");
  return ctx;
}
