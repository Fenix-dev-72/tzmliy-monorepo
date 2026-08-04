import type { ReactNode } from "react";

// Single source of truth for the dashboard page shell width (2026-07-27
// mockup reskin) -- every /dashboard/* page used to hand-type its own
// max-w-{3xl|4xl|5xl} on its <main>, so pages rendered at visibly different
// widths from each other and from Home (max-w-[1440px]). The mockup uses one
// consistent 1440px-capped shell for every screen; this component is that
// shell so new pages can't drift from it again.
export function DashboardPageContainer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <main className={`mx-auto max-w-[1440px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8 ${className}`}>{children}</main>
  );
}
