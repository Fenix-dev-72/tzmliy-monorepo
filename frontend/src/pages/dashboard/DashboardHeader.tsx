import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Bell, LogOut, Menu, Settings } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import { TizimlyLogo, TizimlyWordmark } from "@/components/layout/TizimlyLogo";
import { LangToggle } from "@/components/layout/LangToggle";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

const content = {
  uz: { logout: "Chiqish", settings: "Sozlamalar", notifications: "Bildirishnomalar" },
  ru: { logout: "Выйти", settings: "Настройки", notifications: "Уведомления" },
};

export function DashboardHeader({ onMenuClick }: { onMenuClick?: () => void }) {
  const { lang } = useLang();
  const t = content[lang];
  const { user, logout } = useTenantAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [profileOpen]);

  const displayName = user?.full_name || user?.email || user?.phone || "";
  const initial = displayName ? displayName[0]?.toUpperCase() : "?";

  return (
    <header className="border-card-border bg-background/80 sticky top-0 z-20 border-b backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex shrink-0 items-center gap-2.5">
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="border-card-border text-foreground-muted mr-1 flex size-9 items-center justify-center rounded-lg border lg:hidden"
              aria-label="Menu"
            >
              <Menu size={16} />
            </button>
          )}
          <TizimlyLogo size={30} />
          <TizimlyWordmark className="hidden text-lg sm:inline" />
        </div>

        <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
          <LangToggle />
          <ThemeToggle />
          <Link
            to="/dashboard/notifications"
            aria-label={t.notifications}
            title={t.notifications}
            className="border-card-border text-foreground-muted hover:bg-accent hover:text-foreground flex size-9 items-center justify-center rounded-lg border transition-colors"
          >
            <Bell size={16} />
          </Link>

          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen((o) => !o)}
              className="hover:bg-accent flex items-center gap-2.5 rounded-xl py-1 pr-1 pl-1 transition-colors sm:pr-2.5"
            >
              <span className="bg-primary/12 text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                {initial}
              </span>
              <span className="hidden text-left sm:block">
                <span className="text-foreground block text-sm leading-tight font-semibold">{displayName}</span>
                <span className="text-foreground-muted block text-xs leading-tight">{user?.role_name}</span>
              </span>
            </button>

            {profileOpen && (
              <div className="glass-card absolute top-full right-0 z-10 mt-2 w-52 overflow-hidden p-1.5">
                <Link
                  to="/dashboard/settings/2fa"
                  onClick={() => setProfileOpen(false)}
                  className="hover:bg-accent flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground"
                >
                  <Settings size={15} className="text-foreground-muted" />
                  {t.settings}
                </Link>
                <button
                  onClick={() => logout()}
                  className="hover:bg-accent flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-destructive"
                >
                  <LogOut size={15} />
                  {t.logout}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
