import { Outlet } from "react-router";
import { BrandPanel } from "@/components/auth/BrandPanel";
import { Navbar } from "@/pages/landing/sections/Navbar";
import { Footer } from "@/pages/landing/sections/Footer";

// Uses the landing page's own floating Navbar + Footer (2026-07-22, explicit
// request to reuse them here too) instead of the auth-specific AuthTopBar --
// AuthTopBar itself is untouched and still used by PlatformAuthLayout.
// Navbar is `fixed`, so it takes no layout space -- the content column below
// needs its own top padding (pt-24/28, same order of magnitude as the
// landing sections' pt-32/40) to clear the floating capsule instead of
// being hidden under it.
export function TenantAuthLayout() {
  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />

      <div className="flex flex-1 flex-col pt-24 sm:pt-28 lg:flex-row">
        <div className="hidden lg:block lg:w-[45%] lg:shrink-0">
          <BrandPanel />
        </div>

        <div className="flex flex-1 items-center justify-center px-4 pt-2 pb-12 sm:px-6">
          <Outlet />
        </div>
      </div>

      <div className="hidden lg:block">
        <Footer />
      </div>
    </div>
  );
}
