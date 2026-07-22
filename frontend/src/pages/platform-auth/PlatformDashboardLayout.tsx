import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { LogOut, ShieldCheck } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { usePlatformAuth } from "@/lib/auth/platformAuthStore";
import { TizimlyLogo, TizimlyWordmark } from "@/components/layout/TizimlyLogo";
import { LangToggle } from "@/components/layout/LangToggle";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { PlatformDashboardSidebar } from "./PlatformDashboardSidebar";

const content = {
  uz: { badge: "Platform Admin", logout: "Chiqish" },
  ru: { badge: "Platform Admin", logout: "Выйти" },
};

export function PlatformDashboardLayout() {
  const { lang } = useLang();
  const t = content[lang];
  const navigate = useNavigate();
  const { status, totpEnabled, logout } = usePlatformAuth();

  // Centralizes the guard every /platform/welcome, /platform/tenants/new
  // page used to repeat individually via its own useEffect.
  useEffect(() => {
    if (status === "anonymous") navigate("/platform/login", { replace: true });
    else if (status === "authenticated" && !totpEnabled) navigate("/platform/2fa-setup", { replace: true });
  }, [status, totpEnabled, navigate]);

  if (status !== "authenticated" || !totpEnabled) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-card-border bg-background/80 sticky top-0 z-20 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex shrink-0 items-center gap-2.5">
            <TizimlyLogo size={26} />
            <TizimlyWordmark className="hidden text-base sm:inline" />
            <span className="bg-primary/12 text-primary ml-2 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold">
              <ShieldCheck size={13} />
              {t.badge}
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <LangToggle />
            <ThemeToggle />
            <button
              onClick={() => logout().then(() => navigate("/"))}
              className="border-card-border text-destructive hover:bg-accent flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">{t.logout}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px]">
        <PlatformDashboardSidebar />
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
