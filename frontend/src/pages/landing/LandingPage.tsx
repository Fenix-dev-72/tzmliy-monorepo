import { Navigate } from "react-router";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import { Navbar } from "./sections/Navbar";
import { HeroSection } from "./sections/HeroSection";
import { TrustStrip } from "./sections/TrustStrip";
import { StatsSection } from "./sections/StatsSection";
import { FeaturesGrid } from "./sections/FeaturesGrid";
import { FeatureShowcase } from "./sections/FeatureShowcase";
import { CommsShowcase } from "./sections/CommsShowcase";
import { DataAnalyticsSection } from "./sections/DataAnalyticsSection";
import { IntegrationsSection } from "./sections/IntegrationsSection";
import { TabsShowcase } from "./sections/TabsShowcase";
import { PricingSection } from "./sections/PricingSection";
import { FAQSection } from "./sections/FAQSection";
import { CTASection } from "./sections/CTASection";
import { Footer } from "./sections/Footer";

// Clean-slate landing page (2026-07-20 rebuild) -- now complete end to end:
// floating capsule Navbar + Hero (headline + animated dashboard mockup) +
// Stats + Features grid + Feature showcase + Comms showcase + Data/Analytics
// + Integrations + Tabs showcase + Pricing + closing newsletter CTA +
// Footer (2026-07-21).
export function LandingPage() {
  const { status } = useTenantAuth();

  // A logged-in user landing on "/" (bookmark, typed URL, back button) should
  // go straight to their dashboard, not see the marketing page again.
  // "authenticating" covers the brief session-restore window on a hard
  // reload (see tenantAuthStore's lazy status init) -- render nothing rather
  // than flashing the landing page for a frame before redirecting.
  if (status === "authenticated") return <Navigate to="/dashboard" replace />;
  if (status === "authenticating") return null;

  return (
    <div className="bg-background text-foreground min-h-screen overflow-x-hidden">
      <Navbar />
      <HeroSection />
      <TrustStrip />
      <StatsSection />
      <FeaturesGrid />
      <FeatureShowcase />
      <CommsShowcase />
      <DataAnalyticsSection />
      <IntegrationsSection />
      <TabsShowcase />
      <PricingSection />
      <FAQSection />
      <CTASection />
      <Footer />
    </div>
  );
}
