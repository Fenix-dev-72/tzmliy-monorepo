import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import { EntitlementsProvider } from "@/lib/billing/EntitlementsContext";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardSidebar } from "./DashboardSidebar";
import { DashboardBottomNav } from "./DashboardBottomNav";
import { FloatingActionButton } from "./FloatingActionButton";

export function DashboardLayout() {
  const navigate = useNavigate();
  const { status } = useTenantAuth();

  useEffect(() => {
    if (status === "anonymous") navigate("/login", { replace: true });
  }, [status, navigate]);

  // Mockup uses Manrope for all UI text (Inter stays the default `font-body`
  // for landing/auth, unaffected) -- toggled on <body> rather than a wrapper
  // div because Radix Dialog/Popover content portals straight to <body>,
  // escaping any class placed on this component's own root element.
  useEffect(() => {
    document.body.classList.add("font-heading");
    return () => document.body.classList.remove("font-heading");
  }, []);

  if (status !== "authenticated") return null;

  return (
    <EntitlementsProvider>
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <div className="mx-auto flex max-w-[1440px]">
          <DashboardSidebar />
          <div className="min-w-0 flex-1 pb-24 lg:pb-10">
            <Outlet />
          </div>
        </div>
        <FloatingActionButton />
        <DashboardBottomNav />
      </div>
    </EntitlementsProvider>
  );
}
