import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/ui/utils";

// Renders `children` at a fixed natural width, then uniformly scales the
// whole thing down (via CSS transform, never up) so it always fits the
// available container width -- used for the hero dashboard mockup so mobile
// shows the exact same layout as desktop (sidebar, 3-column KPI grid, status
// badges, everything), just shrunk, instead of the layout itself
// restructuring at each breakpoint.
//
// The outer wrapper flex-centers the natural-width box (so its horizontal
// midpoint lines up with the outer container's midpoint) and clips overflow;
// the inner box scales from `top center`, so the shrunk result stays
// centered instead of drifting toward one edge. The wrapper's height is set
// explicitly to the scaled height so it doesn't leave empty space below the
// shrunk content -- a plain `transform: scale()` doesn't affect layout
// sizing on its own.
export function ScaleToFit({
  children,
  naturalWidth,
  className,
}: {
  children: ReactNode;
  naturalWidth: number;
  className?: string;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    function recompute() {
      const availableWidth = outer!.clientWidth;
      const s = availableWidth > 0 ? Math.min(1, availableWidth / naturalWidth) : 1;
      setScale(s);
      setNaturalHeight(inner!.scrollHeight);
    }

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [naturalWidth]);

  return (
    <div
      ref={outerRef}
      className={cn("flex justify-center overflow-hidden", className)}
      style={{ height: naturalHeight ? naturalHeight * scale : undefined }}
    >
      <div
        ref={innerRef}
        style={{ width: naturalWidth, flexShrink: 0, transform: `scale(${scale})`, transformOrigin: "top center" }}
      >
        {children}
      </div>
    </div>
  );
}
