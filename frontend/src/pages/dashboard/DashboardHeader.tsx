import { LogOut, Menu } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import { TzmliyLogo, TzmliyWordmark } from "@/components/layout/TzmliyLogo";
import { LangToggle } from "@/components/layout/LangToggle";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

const content = {
  uz: { logout: "Chiqish" },
  ru: { logout: "Выйти" },
};

export function DashboardHeader({ onMenuClick }: { onMenuClick?: () => void }) {
  const { lang } = useLang();
  const t = content[lang];
  const { user, logout } = useTenantAuth();

  return (
    <header className="border-card-border bg-background/80 sticky top-0 z-20 border-b backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="border-card-border text-foreground-muted mr-1 flex size-9 items-center justify-center rounded-lg border transition-transform duration-150 hover:bg-accent active:scale-90 lg:hidden"
              aria-label="Menu"
            >
              <Menu size={16} />
            </button>
          )}
          <TzmliyLogo size={30} />
          <TzmliyWordmark className="text-lg" />
        </div>

        <div className="flex items-center gap-3">
          {user?.email && (
            <span className="hidden text-sm font-medium text-foreground-muted sm:inline">{user.email}</span>
          )}
          <LangToggle />
          <ThemeToggle />
          <button
            onClick={() => logout()}
            className="border-card-border flex size-9 items-center justify-center rounded-lg border text-foreground-muted transition-all duration-150 hover:bg-accent hover:text-destructive active:scale-90"
            aria-label={t.logout}
            title={t.logout}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
