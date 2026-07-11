import { Navbar } from "./sections/Navbar";
import { HeroSection } from "./sections/HeroSection";
import { StatsBar } from "./sections/StatsBar";
import { FeatureShowcase } from "./sections/FeatureShowcase";
import { ProblemSolution } from "./sections/ProblemSolution";
import { FeaturesGrid } from "./sections/FeaturesGrid";
import { SecuritySection } from "./sections/SecuritySection";
import { IntegrationsSection } from "./sections/IntegrationsSection";
import { PricingSection } from "./sections/PricingSection";
import { CTASection } from "./sections/CTASection";
import { Footer } from "./sections/Footer";

export function LandingPage() {
  return (
    <div className="overflow-x-hidden">
      <Navbar />
      <HeroSection />
      <StatsBar />
      <FeatureShowcase />
      <ProblemSolution />
      <FeaturesGrid />
      <SecuritySection />
      <IntegrationsSection />
      <PricingSection />
      <CTASection />
      <Footer />
    </div>
  );
}
