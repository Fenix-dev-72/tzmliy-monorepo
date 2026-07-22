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
  X,
} from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import { TizimlyLogo, TizimlyWordmark } from "@/components/layout/TizimlyLogo";

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

function useNavItems() {
  const { lang } = useLang();
  const { user } = useTenantAuth();
  const t = content[lang];
  const permissions = new Set(user?.permissions ?? []);

  return [
    { to: "/dashboard", end: true, icon: LayoutDashboard, label: t.home, show: true },
    { to: "/dashboard/sales", end: false, icon: ShoppingCart, label: t.sales, show: permissions.has("sales.view") },
    {
      to: "/dashboard/customers",
      end: false,
      icon: Users,
      label: t.customers,
      show: permissions.has("customers.view"),
    },
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
    {
      to: "/dashboard/integrations",
      end: false,
      icon: Plug,
      label: t.integrations,
      show: permissions.has("crm.view"),
    },
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
    {
      to: "/dashboard/reports",
      end: false,
      icon: FileBarChart,
      label: t.reports,
      show: permissions.has("reports.view"),
    },
    { to: "/dashboard/support", end: false, icon: LifeBuoy, label: t.support, show: true },
  ].filter((item) => item.show);
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const items = useNavItems();
  const { user } = useTenantAuth();
  const { lang } = useLang();
  const t = content[lang];

  return (
    <nav className="flex flex-col gap-1 px-3">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
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

      <div className="border-card-border my-2 border-t" />

      <NavLink
        to="/dashboard/settings/2fa"
        onClick={onNavigate}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
            isActive
              ? "bg-accent-orange/12 text-accent-orange"
              : "text-foreground-muted hover:translate-x-0.5 hover:bg-accent hover:text-foreground"
          }`
        }
      >
        <Settings size={18} />
        {t.settings}
        {!user?.totp_enabled && <ShieldAlert size={14} className="text-warning ml-auto" />}
      </NavLink>
    </nav>
  );
}

export function DashboardSidebar() {
  return (
    <aside className="border-card-border bg-background/60 hidden w-[280px] shrink-0 border-r lg:block">
      <div className="sticky top-16 py-6">
        <NavItems />
      </div>
    </aside>
  );
}

export function DashboardMobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="bg-background/80 absolute inset-0 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-background border-card-border relative flex h-full w-72 flex-col border-r pt-5 pb-6">
        <div className="mb-6 flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <TizimlyLogo size={26} />
            <TizimlyWordmark className="text-base" />
          </div>
          <button
            onClick={onClose}
            className="text-foreground-muted flex size-8 items-center justify-center rounded-lg"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        <NavItems onNavigate={onClose} />
      </div>
    </div>
  );
}
