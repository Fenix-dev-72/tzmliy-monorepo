import { useState } from "react";
import { NavLink } from "react-router";
import {
  Bell,
  BookOpen,
  CalendarCheck,
  FileBarChart,
  LayoutDashboard,
  LifeBuoy,
  Package,
  Phone,
  Plug,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Trophy,
  UserCog,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";

const content = {
  uz: {
    home: "Bosh sahifa",
    sales: "Savdolar",
    customers: "Mijozlar",
    finance: "Moliya",
    sellers: "Sotuvchilar",
    users: "Foydalanuvchilar",
    roles: "Rollar",
    calls: "Qo'ng'iroqlar",
    attendance: "Davomat",
    integrations: "Integratsiyalar",
    notifications: "Bildirishnomalar",
    catalog: "Mahsulotlar",
    warehouse: "Ombor",
    courseSales: "Course sales",
    reports: "Hisobotlar",
    support: "Yordam so'rash",
    settings: "Sozlamalar",
  },
  ru: {
    home: "Главная",
    sales: "Продажи",
    customers: "Клиенты",
    finance: "Финансы",
    sellers: "Продавцы",
    users: "Пользователи",
    roles: "Роли",
    calls: "Звонки",
    attendance: "Посещаемость",
    integrations: "Интеграции",
    notifications: "Уведомления",
    catalog: "Продукты",
    warehouse: "Склад",
    courseSales: "Course sales",
    reports: "Отчёты",
    support: "Обратиться за помощью",
    settings: "Настройки",
  },
};

// Single source of truth for the nav item list, ordered to match the design
// mockup's `navDef` array exactly -- DashboardSidebar (desktop, full list),
// DashboardBottomNav (first 4), and DashboardMoreSheet (the rest) all derive
// from this same hook so the three surfaces can never drift out of sync.
export function useNavItems() {
  const { lang } = useLang();
  const { user } = useTenantAuth();
  const t = content[lang];
  const permissions = new Set(user?.permissions ?? []);

  return [
    { to: "/dashboard", end: true, icon: LayoutDashboard, label: t.home, show: true },
    { to: "/dashboard/sales", end: false, icon: ShoppingCart, label: t.sales, show: permissions.has("sales.view") },
    { to: "/dashboard/customers", end: false, icon: Users, label: t.customers, show: permissions.has("customers.view") },
    { to: "/dashboard/finance", end: false, icon: Wallet, label: t.finance, show: permissions.has("finance.view") },
    {
      to: "/dashboard/sellers",
      end: false,
      icon: Trophy,
      label: t.sellers,
      show: permissions.has("users.view") && permissions.has("analytics.view"),
    },
    { to: "/dashboard/users", end: false, icon: UserCog, label: t.users, show: permissions.has("users.view") },
    { to: "/dashboard/roles", end: false, icon: ShieldCheck, label: t.roles, show: permissions.has("roles.view") },
    { to: "/dashboard/calls", end: false, icon: Phone, label: t.calls, show: permissions.has("calls.view") },
    { to: "/dashboard/attendance", end: false, icon: CalendarCheck, label: t.attendance, show: true },
    { to: "/dashboard/integrations", end: false, icon: Plug, label: t.integrations, show: permissions.has("crm.view") },
    {
      to: "/dashboard/notifications",
      end: false,
      icon: Bell,
      label: t.notifications,
      show: permissions.has("notifications.view"),
    },
    { to: "/dashboard/products", end: false, icon: Package, label: t.catalog, show: permissions.has("catalog.view") },
    { to: "/dashboard/warehouse", end: false, icon: Warehouse, label: t.warehouse, show: permissions.has("catalog.view") },
    {
      to: "/dashboard/course-sales",
      end: false,
      icon: BookOpen,
      label: t.courseSales,
      show: permissions.has("analytics.view"),
    },
    { to: "/dashboard/reports", end: false, icon: FileBarChart, label: t.reports, show: permissions.has("reports.view") },
    { to: "/dashboard/support", end: false, icon: LifeBuoy, label: t.support, show: true },
    {
      to: "/dashboard/settings/2fa",
      end: false,
      icon: Settings,
      label: t.settings,
      show: true,
      warn: !user?.totp_enabled,
    },
  ].filter((item) => item.show);
}

// Desktop-only (lg:+) hover-to-expand icon rail -- collapsed at 68px (icons
// only), expands to 236px with labels on hover, matching the mockup exactly
// (mobile/tablet below the lg cutoff get DashboardBottomNav + the "Boshqa"
// sheet instead, never this rail).
export function DashboardSidebar() {
  const items = useNavItems();
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div aria-hidden className="hidden lg:block lg:w-[68px] lg:shrink-0" />
      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className={`border-card-border bg-background no-scrollbar fixed top-16 left-0 z-35 hidden h-[calc(100vh-4rem)] flex-col gap-0.5 overflow-x-hidden overflow-y-auto border-r py-4 transition-[width] duration-200 ease-out lg:flex ${
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
            {item.warn && expanded && <ShieldAlert size={13} className="text-warning ml-auto shrink-0" />}
          </NavLink>
        ))}
      </aside>
    </>
  );
}
