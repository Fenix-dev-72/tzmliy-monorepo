import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardSidebar, DashboardMobileDrawer } from "./DashboardSidebar";

export function DashboardLayout() {
  const navigate = useNavigate();
  const { status } = useTenantAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (status === "anonymous") navigate("/login", { replace: true });
  }, [status, navigate]);

  if (status !== "authenticated") return null;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onMenuClick={() => setDrawerOpen(true)} />
      <DashboardMobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="mx-auto flex max-w-7xl">
        <DashboardSidebar />
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
