import { useState } from "react";
import { NavLink } from "react-router";
import { CreditCard, DatabaseBackup, LayoutDashboard, Megaphone, MessageSquareWarning, PlusCircle } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";

const content = {
  uz: {
    home: "Bosh sahifa",
    complaints: "Shikoyatlar",
    newTenant: "Yangi tenant yaratish",
    backupSettings: "Backup sozlamalari",
    billingPlans: "Tarif rejalar",
    broadcast: "Xabar yuborish",
  },
  ru: {
    home: "Главная",
    complaints: "Жалобы",
    newTenant: "Создать тенанта",
    backupSettings: "Настройки бэкапа",
    billingPlans: "Тарифные планы",
    broadcast: "Отправить сообщение",
  },
};

// Desktop-only (lg:+) hover-to-expand icon rail -- same pattern as the
// tenant dashboard's DashboardSidebar.tsx (collapsed 68px icons-only,
// expands to 236px with labels on hover). Platform Admin has no
// below-`lg` nav equivalent (bottom bar / "more" sheet) -- it's an
// internal team tool, desktop-first by existing convention.
export function PlatformDashboardSidebar() {
  const { lang } = useLang();
  const t = content[lang];
  const [expanded, setExpanded] = useState(false);

  const items = [
    { to: "/platform/dashboard", end: true, icon: LayoutDashboard, label: t.home },
    { to: "/platform/complaints", end: false, icon: MessageSquareWarning, label: t.complaints },
    { to: "/platform/tenants/new", end: false, icon: PlusCircle, label: t.newTenant },
    { to: "/platform/billing-plans", end: false, icon: CreditCard, label: t.billingPlans },
    { to: "/platform/broadcast", end: false, icon: Megaphone, label: t.broadcast },
    { to: "/platform/backup-settings", end: false, icon: DatabaseBackup, label: t.backupSettings },
  ];

  return (
    <>
      <div aria-hidden className="hidden lg:block lg:w-[68px] lg:shrink-0" />
      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className={`border-card-border bg-background/60 no-scrollbar fixed top-16 left-0 z-35 hidden h-[calc(100vh-4rem)] flex-col gap-0.5 overflow-x-hidden overflow-y-auto border-r py-4 transition-[width] duration-200 ease-out lg:flex ${
          expanded ? "w-[236px] px-3" : "w-[68px] px-2.5"
        }`}
      >
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={item.label}
            className={({ isActive }) =>
              `relative flex items-center rounded-xl py-2.5 text-[13.5px] font-semibold whitespace-nowrap transition-colors ${
                expanded ? "justify-start gap-2.5 px-3" : "justify-center px-0"
              } ${isActive ? "bg-accent-orange/13 text-accent-orange" : "text-foreground-muted hover:bg-accent hover:text-foreground"}`
            }
          >
            <item.icon size={18} className="shrink-0" />
            <span
              className={`overflow-hidden transition-opacity duration-150 ${expanded ? "w-auto opacity-100" : "w-0 opacity-0"}`}
            >
              {item.label}
            </span>
          </NavLink>
        ))}
      </aside>
    </>
  );
}
