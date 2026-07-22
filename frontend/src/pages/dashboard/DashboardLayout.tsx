import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardSidebar, DashboardMobileDrawer } from "./DashboardSidebar";
import { DashboardBottomNav } from "./DashboardBottomNav";
import { FloatingActionButton } from "./FloatingActionButton";

const COMPLETE_SETUP_PATH = "/dashboard/complete-setup";
// 2FA setup is reachable even while pending_links is non-empty -- otherwise
// a brand-new tenant's very first admin (no 2FA yet) gets permanently stuck:
// configuring the tenant's own Telegram bot needs notifications.manage
// (privileged, 2FA-gated), but they can't reach the 2FA page to fix that
// if this same gate blocks everything except complete-setup.
//
// Integrations is exempt for the same chicken-and-egg reason (found
// 2026-07-15): pending_links includes "utel"/"crm" for any user with
// calls.view/crm.view, regardless of whether the tenant has configured any
// UTEL/AmoCRM/Bitrix24 integration_credentials yet -- a brand-new tenant's
// admin has nothing real to self-link to until *they* configure the
// integration first, but couldn't reach the page that lets them do that.
const EXEMPT_PATHS = [COMPLETE_SETUP_PATH, "/dashboard/settings/2fa", "/dashboard/integrations"];

// CRM/manager self-linking is no longer mandatory (2026-07-17, explicit
// request) -- it's still offered on CompleteSetupPage as an optional card
// when reached, but it alone should never force a redirect there. Telegram
// and UTEL linking stay mandatory/blocking, unchanged.
const BLOCKING_PENDING_LINKS = ["telegram", "utel"];

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { status, user } = useTenantAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (status === "anonymous") navigate("/login", { replace: true });
  }, [status, navigate]);

  // Client requirement (2026-07-11): an employee must finish self-linking
  // Telegram/UTEL before using the rest of the dashboard -- a hard redirect
  // (not just a banner), same intent as the 2FA-required banner elsewhere
  // but blocking since the client explicitly asked for enforcement. CRM
  // linking was dropped from this blocking set on 2026-07-17 (see
  // BLOCKING_PENDING_LINKS above) -- it's no longer required to get in.
  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    const needsSetup = user.pending_links.some((link) => BLOCKING_PENDING_LINKS.includes(link));
    if (needsSetup && !EXEMPT_PATHS.includes(location.pathname)) {
      navigate(COMPLETE_SETUP_PATH, { replace: true });
    } else if (!needsSetup && location.pathname === COMPLETE_SETUP_PATH) {
      navigate("/dashboard", { replace: true });
    }
  }, [status, user, location.pathname, navigate]);

  if (status !== "authenticated") return null;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onMenuClick={() => setDrawerOpen(true)} />
      <DashboardMobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="mx-auto flex max-w-[1440px]">
        <DashboardSidebar />
        <div className="min-w-0 flex-1 pb-20 lg:pb-0">
          <Outlet />
        </div>
      </div>
      <FloatingActionButton />
      <DashboardBottomNav />
    </div>
  );
}
