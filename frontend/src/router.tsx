import { createBrowserRouter } from "react-router";
import { LandingPage } from "@/pages/landing/LandingPage";
import { TenantAuthLayout } from "@/pages/tenant-auth/TenantAuthLayout";
import { DashboardLayout } from "@/pages/dashboard/DashboardLayout";
import { PlatformAuthLayout } from "@/pages/platform-auth/PlatformAuthLayout";
import { PlatformDashboardLayout } from "@/pages/platform-auth/PlatformDashboardLayout";
import { NotFound } from "@/pages/NotFound";

// Route-level code splitting (2026-07-17) -- every dashboard/auth/platform
// page used to be imported eagerly at the top of this file, so the very
// first page load shipped one ~1.15MB JS bundle containing Sales, Finance,
// Reports, the whole Platform Admin console, etc. even though a given
// session only ever touches a handful of those routes. react-router 7's
// native `lazy` route field splits each page into its own chunk, fetched
// only the first time its route is actually visited -- no manual
// React.lazy/Suspense wrapper needed, the router handles the pending
// navigation itself. Only the shells that render on (almost) every request
// (LandingPage as the site's first paint, the three layout wrappers, and
// NotFound) stay eager -- splitting those further would just add a network
// round trip to the pages guaranteed to be needed immediately.

export const router = createBrowserRouter([
  { path: "/", element: <LandingPage /> },
  {
    path: "/tv",
    lazy: () => import("@/pages/kiosk/DashboardKioskPage").then((m) => ({ Component: m.DashboardKioskPage })),
  },
  {
    path: "/dashboard",
    element: <DashboardLayout />,
    children: [
      { index: true, lazy: () => import("@/pages/dashboard/DashboardPage").then((m) => ({ Component: m.DashboardPage })) },
      { path: "sales", lazy: () => import("@/pages/dashboard/SalesPage").then((m) => ({ Component: m.SalesPage })) },
      {
        path: "customers",
        lazy: () => import("@/pages/dashboard/CustomersPage").then((m) => ({ Component: m.CustomersPage })),
      },
      { path: "finance", lazy: () => import("@/pages/dashboard/FinancePage").then((m) => ({ Component: m.FinancePage })) },
      { path: "sellers", lazy: () => import("@/pages/dashboard/SellersPage").then((m) => ({ Component: m.SellersPage })) },
      {
        path: "sellers/:userId",
        lazy: () => import("@/pages/dashboard/SellerDetailPage").then((m) => ({ Component: m.SellerDetailPage })),
      },
      { path: "users", lazy: () => import("@/pages/dashboard/UsersPage").then((m) => ({ Component: m.UsersPage })) },
      { path: "roles", lazy: () => import("@/pages/dashboard/RolesPage").then((m) => ({ Component: m.RolesPage })) },
      { path: "calls", lazy: () => import("@/pages/dashboard/CallsPage").then((m) => ({ Component: m.CallsPage })) },
      {
        path: "attendance",
        lazy: () => import("@/pages/dashboard/AttendancePage").then((m) => ({ Component: m.AttendancePage })),
      },
      {
        path: "integrations",
        lazy: () => import("@/pages/dashboard/IntegrationsPage").then((m) => ({ Component: m.IntegrationsPage })),
      },
      {
        path: "notifications",
        lazy: () => import("@/pages/dashboard/NotificationsPage").then((m) => ({ Component: m.NotificationsPage })),
      },
      { path: "products", lazy: () => import("@/pages/dashboard/ProductsPage").then((m) => ({ Component: m.ProductsPage })) },
      {
        path: "warehouse",
        lazy: () => import("@/pages/dashboard/WarehousePage").then((m) => ({ Component: m.WarehousePage })),
      },
      {
        path: "course-sales",
        lazy: () => import("@/pages/dashboard/CourseSalesPage").then((m) => ({ Component: m.CourseSalesPage })),
      },
      { path: "reports", lazy: () => import("@/pages/dashboard/ReportsPage").then((m) => ({ Component: m.ReportsPage })) },
      { path: "support", lazy: () => import("@/pages/dashboard/SupportPage").then((m) => ({ Component: m.SupportPage })) },
      {
        path: "settings/2fa",
        lazy: () => import("@/pages/dashboard/TwoFactorSettingsPage").then((m) => ({ Component: m.TwoFactorSettingsPage })),
      },
      {
        path: "complete-setup",
        lazy: () => import("@/pages/dashboard/CompleteSetupPage").then((m) => ({ Component: m.CompleteSetupPage })),
      },
    ],
  },
  {
    path: "/login",
    element: <TenantAuthLayout />,
    children: [
      { index: true, lazy: () => import("@/pages/tenant-auth/LoginView").then((m) => ({ Component: m.LoginView })) },
      { path: "otp", lazy: () => import("@/pages/tenant-auth/OtpVerifyView").then((m) => ({ Component: m.OtpVerifyView })) },
      { path: "2fa", lazy: () => import("@/pages/tenant-auth/TwoFaVerifyView").then((m) => ({ Component: m.TwoFaVerifyView })) },
      {
        path: "forgot",
        lazy: () => import("@/pages/tenant-auth/ForgotPasswordView").then((m) => ({ Component: m.ForgotPasswordView })),
      },
      { path: "reset", lazy: () => import("@/pages/tenant-auth/NewPasswordView").then((m) => ({ Component: m.NewPasswordView })) },
    ],
  },
  {
    path: "/register",
    element: <TenantAuthLayout />,
    children: [
      { index: true, lazy: () => import("@/pages/tenant-auth/RegisterView").then((m) => ({ Component: m.RegisterView })) },
      {
        path: "verify",
        lazy: () => import("@/pages/tenant-auth/RegisterVerifyView").then((m) => ({ Component: m.RegisterVerifyView })),
      },
      {
        path: "complete",
        lazy: () => import("@/pages/tenant-auth/RegisterCompleteView").then((m) => ({ Component: m.RegisterCompleteView })),
      },
      { path: "plan", lazy: () => import("@/pages/tenant-auth/RegisterPlanView").then((m) => ({ Component: m.RegisterPlanView })) },
    ],
  },
  {
    path: "/platform",
    children: [
      {
        path: "login",
        element: <PlatformAuthLayout />,
        children: [
          {
            index: true,
            lazy: () => import("@/pages/platform-auth/PlatformLoginView").then((m) => ({ Component: m.PlatformLoginView })),
          },
          {
            path: "2fa",
            lazy: () =>
              import("@/pages/platform-auth/PlatformTwoFaVerifyView").then((m) => ({ Component: m.PlatformTwoFaVerifyView })),
          },
        ],
      },
      {
        element: <PlatformAuthLayout />,
        children: [
          {
            path: "2fa-setup",
            lazy: () =>
              import("@/pages/platform-auth/PlatformTwoFaSetupView").then((m) => ({ Component: m.PlatformTwoFaSetupView })),
          },
        ],
      },
      {
        element: <PlatformDashboardLayout />,
        children: [
          {
            path: "dashboard",
            lazy: () =>
              import("@/pages/platform-auth/PlatformDashboardPage").then((m) => ({ Component: m.PlatformDashboardPage })),
          },
          {
            path: "complaints",
            lazy: () =>
              import("@/pages/platform-auth/PlatformComplaintsPage").then((m) => ({ Component: m.PlatformComplaintsPage })),
          },
          {
            path: "tenants/new",
            lazy: () =>
              import("@/pages/platform-auth/PlatformCreateTenantView").then((m) => ({ Component: m.PlatformCreateTenantView })),
          },
        ],
      },
    ],
  },
  { path: "*", element: <NotFound /> },
]);
