import { Outlet } from "react-router";
import { BrandPanel } from "@/components/auth/BrandPanel";
import { AuthTopBar } from "@/components/auth/AuthTopBar";

export function TenantAuthLayout() {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block lg:w-[45%] lg:shrink-0">
        <BrandPanel />
      </div>

      <div className="flex min-h-screen flex-1 flex-col">
        <AuthTopBar />
        <div className="flex flex-1 items-center justify-center px-4 pb-12 sm:px-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
