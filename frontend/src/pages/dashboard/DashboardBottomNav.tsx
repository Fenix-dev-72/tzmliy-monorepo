import { NavLink } from "react-router";
import { Bell, LayoutDashboard, ShoppingCart, User, Users } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";

const content = {
  uz: { home: "Bosh sahifa", sales: "Savdolar", customers: "Mijozlar", notifications: "Bildirishnoma", profile: "Profil" },
  ru: { home: "Главная", sales: "Продажи", customers: "Клиенты", notifications: "Уведомления", profile: "Профиль" },
};

// Mobile-only quick-access bar (mockup spec) -- a subset of the full nav
// list, which has 15+ permission-gated items and can't all fit here. Full
// nav stays reachable via the hamburger -> DashboardMobileDrawer.
export function DashboardBottomNav() {
  const { lang } = useLang();
  const t = content[lang];

  const items = [
    { to: "/dashboard", end: true, icon: LayoutDashboard, label: t.home },
    { to: "/dashboard/sales", end: false, icon: ShoppingCart, label: t.sales },
    { to: "/dashboard/customers", end: false, icon: Users, label: t.customers },
    { to: "/dashboard/notifications", end: false, icon: Bell, label: t.notifications },
    { to: "/dashboard/settings/2fa", end: false, icon: User, label: t.profile },
  ];

  return (
    <nav className="border-card-border bg-background/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-xl lg:hidden">
      <div className="flex items-stretch justify-around px-1 py-1.5">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-medium transition-colors ${
                isActive ? "text-accent-orange" : "text-foreground-muted"
              }`
            }
          >
            <item.icon size={20} />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
