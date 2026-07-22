import { Navbar } from "./sections/Navbar";
import { HeroSection } from "./sections/HeroSection";
import { StatsSection } from "./sections/StatsSection";
import { FeaturesGrid } from "./sections/FeaturesGrid";
import { FeatureShowcase } from "./sections/FeatureShowcase";
import { CommsShowcase } from "./sections/CommsShowcase";
import { DataAnalyticsSection } from "./sections/DataAnalyticsSection";
import { IntegrationsSection } from "./sections/IntegrationsSection";
import { TabsShowcase } from "./sections/TabsShowcase";
import { PricingSection } from "./sections/PricingSection";
import { CTASection } from "./sections/CTASection";
import { Footer } from "./sections/Footer";

// Clean-slate landing page (2026-07-20 rebuild) -- now complete end to end:
// floating capsule Navbar + Hero (headline + animated dashboard mockup) +
// Stats + Features grid + Feature showcase + Comms showcase + Data/Analytics
// + Integrations + Tabs showcase + Pricing + closing newsletter CTA +
// Footer (2026-07-21).
export function LandingPage() {
  return (
    <div className="bg-background text-foreground min-h-screen overflow-x-hidden">
      <Navbar />
      <HeroSection />
      <StatsSection />
      <FeaturesGrid />
      <FeatureShowcase />
      <CommsShowcase />
      <DataAnalyticsSection />
      <IntegrationsSection />
      <TabsShowcase />
      <PricingSection />
      <CTASection />
      <Footer />
    </div>
  );
}
