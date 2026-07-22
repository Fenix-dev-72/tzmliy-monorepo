import type { CSSProperties, ReactNode } from "react";
import { useReveal } from "@/lib/hooks/useReveal";
import { cn } from "@/components/ui/utils";

// Generic scroll-reveal wrapper -- fades + rises into place the first time
// it enters the viewport (CSS transition, see `.reveal-on-scroll`). `delay`
// lets callers stagger a row of siblings without each needing their own hook.
// `style` is merged in (not overridden) so callers can combine this with
// their own positioning (e.g. absolute top/left for a scattered layout)
// without losing the transition-delay.
export function Reveal({
  children,
  className,
  delay = 0,
  style,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  style?: CSSProperties;
}) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn("reveal-on-scroll", visible && "is-visible", className)}
      style={{ ...style, transitionDelay: visible ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}
