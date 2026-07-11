import { RouterProvider } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/lib/theme/ThemeContext";
import { LangProvider } from "@/lib/i18n/LangContext";
import { TenantAuthProvider } from "@/lib/auth/tenantAuthStore";
import { PlatformAuthProvider } from "@/lib/auth/platformAuthStore";
import { router } from "./router";

function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <TenantAuthProvider>
          <PlatformAuthProvider>
            <RouterProvider router={router} />
            <Toaster />
          </PlatformAuthProvider>
        </TenantAuthProvider>
      </LangProvider>
    </ThemeProvider>
  );
}

export default App;
