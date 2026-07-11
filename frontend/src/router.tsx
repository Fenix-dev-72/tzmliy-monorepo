import { createBrowserRouter } from "react-router";
import { LandingPage } from "@/pages/landing/LandingPage";
import { TenantAuthLayout } from "@/pages/tenant-auth/TenantAuthLayout";
import { LoginView } from "@/pages/tenant-auth/LoginView";
import { OtpVerifyView } from "@/pages/tenant-auth/OtpVerifyView";
import { TwoFaVerifyView } from "@/pages/tenant-auth/TwoFaVerifyView";
import { ForgotPasswordView } from "@/pages/tenant-auth/ForgotPasswordView";
import { NewPasswordView } from "@/pages/tenant-auth/NewPasswordView";
import { RegisterView } from "@/pages/tenant-auth/RegisterView";
import { RegisterVerifyView } from "@/pages/tenant-auth/RegisterVerifyView";
import { RegisterCompleteView } from "@/pages/tenant-auth/RegisterCompleteView";
import { RegisterPlanView } from "@/pages/tenant-auth/RegisterPlanView";
import { DashboardLayout } from "@/pages/dashboard/DashboardLayout";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { SalesPage } from "@/pages/dashboard/SalesPage";
import { CustomersPage } from "@/pages/dashboard/CustomersPage";
import { FinancePage } from "@/pages/dashboard/FinancePage";
import { UsersPage } from "@/pages/dashboard/UsersPage";
import { RolesPage } from "@/pages/dashboard/RolesPage";
import { SellersPage } from "@/pages/dashboard/SellersPage";
import { CallsPage } from "@/pages/dashboard/CallsPage";
import { AttendancePage } from "@/pages/dashboard/AttendancePage";
import { IntegrationsPage } from "@/pages/dashboard/IntegrationsPage";
import { NotificationsPage } from "@/pages/dashboard/NotificationsPage";
import { CatalogPage } from "@/pages/dashboard/CatalogPage";
import { CourseSalesPage } from "@/pages/dashboard/CourseSalesPage";
import { ReportsPage } from "@/pages/dashboard/ReportsPage";
import { TwoFactorSettingsPage } from "@/pages/dashboard/TwoFactorSettingsPage";
import { DashboardKioskPage } from "@/pages/kiosk/DashboardKioskPage";
import { PlatformAuthLayout } from "@/pages/platform-auth/PlatformAuthLayout";
import { PlatformLoginView } from "@/pages/platform-auth/PlatformLoginView";
import { PlatformTwoFaVerifyView } from "@/pages/platform-auth/PlatformTwoFaVerifyView";
import { PlatformTwoFaSetupView } from "@/pages/platform-auth/PlatformTwoFaSetupView";
import { PlatformWelcomeView } from "@/pages/platform-auth/PlatformWelcomeView";
import { PlatformCreateTenantView } from "@/pages/platform-auth/PlatformCreateTenantView";
import { NotFound } from "@/pages/NotFound";

export const router = createBrowserRouter([
  { path: "/", element: <LandingPage /> },
  { path: "/tv", element: <DashboardKioskPage /> },
  {
    path: "/dashboard",
    element: <DashboardLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "sales", element: <SalesPage /> },
      { path: "customers", element: <CustomersPage /> },
      { path: "finance", element: <FinancePage /> },
      { path: "sellers", element: <SellersPage /> },
      { path: "users", element: <UsersPage /> },
      { path: "roles", element: <RolesPage /> },
      { path: "calls", element: <CallsPage /> },
      { path: "attendance", element: <AttendancePage /> },
      { path: "integrations", element: <IntegrationsPage /> },
      { path: "notifications", element: <NotificationsPage /> },
      { path: "catalog", element: <CatalogPage /> },
      { path: "course-sales", element: <CourseSalesPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "settings/2fa", element: <TwoFactorSettingsPage /> },
    ],
  },
  {
    path: "/login",
    element: <TenantAuthLayout />,
    children: [
      { index: true, element: <LoginView /> },
      { path: "otp", element: <OtpVerifyView /> },
      { path: "2fa", element: <TwoFaVerifyView /> },
      { path: "forgot", element: <ForgotPasswordView /> },
      { path: "reset", element: <NewPasswordView /> },
    ],
  },
  {
    path: "/register",
    element: <TenantAuthLayout />,
    children: [
      { index: true, element: <RegisterView /> },
      { path: "verify", element: <RegisterVerifyView /> },
      { path: "complete", element: <RegisterCompleteView /> },
      { path: "plan", element: <RegisterPlanView /> },
    ],
  },
  {
    path: "/platform",
    children: [
      {
        path: "login",
        element: <PlatformAuthLayout />,
        children: [
          { index: true, element: <PlatformLoginView /> },
          { path: "2fa", element: <PlatformTwoFaVerifyView /> },
        ],
      },
      {
        element: <PlatformAuthLayout />,
        children: [
          { path: "2fa-setup", element: <PlatformTwoFaSetupView /> },
          { path: "welcome", element: <PlatformWelcomeView /> },
          { path: "tenants/new", element: <PlatformCreateTenantView /> },
        ],
      },
    ],
  },
  { path: "*", element: <NotFound /> },
]);
