import { NavLink } from "react-router";
import { LayoutDashboard, MessageSquareWarning, PlusCircle } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";

const content = {
  uz: {
    home: "Bosh sahifa",
    complaints: "Shikoyatlar",
    newTenant: "Yangi tenant yaratish",
  },
  ru: {
    home: "Главная",
    complaints: "Жалобы",
    newTenant: "Создать тенанта",
  },
};

export function PlatformDashboardSidebar() {
  const { lang } = useLang();
  const t = content[lang];

  const items = [
    { to: "/platform/dashboard", end: true, icon: LayoutDashboard, label: t.home },
    { to: "/platform/complaints", end: false, icon: MessageSquareWarning, label: t.complaints },
    { to: "/platform/tenants/new", end: false, icon: PlusCircle, label: t.newTenant },
  ];

  return (
    <aside className="border-card-border bg-background/60 hidden w-[260px] shrink-0 border-r lg:block">
      <div className="sticky top-16 flex flex-col gap-1 px-3 py-6">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-accent-orange/12 text-accent-orange"
                  : "text-foreground-muted hover:translate-x-0.5 hover:bg-accent hover:text-foreground"
              }`
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </div>
    </aside>
  );
}
