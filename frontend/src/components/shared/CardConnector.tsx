import type { CSSProperties } from "react";
import { cn } from "@/components/ui/utils";

// Thin gold hairline drawn between two adjacent cards in a real (gapped)
// grid -- part of the "connected sequential reveal" landing-page pass. Takes
// a `visible` flag instead of its own IntersectionObserver so it can be
// timed against the exact same stagger delay as the cards it sits between
// (see FeaturesGrid.tsx/PricingSection.tsx for callers).
export function CardConnector({
  orientation,
  delay = 0,
  visible,
  className,
  style,
}: {
  orientation: "h" | "v";
  delay?: number;
  visible: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={cn("card-connector", orientation === "h" ? "card-connector-h" : "card-connector-v", visible && "is-visible", className)}
      style={{ ...style, transitionDelay: visible ? `${delay}ms` : "0ms" }}
    />
  );
}
