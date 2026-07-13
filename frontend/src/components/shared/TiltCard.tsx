import type { ReactNode } from "react";
import { useTilt } from "@/lib/hooks/useTilt";

export function TiltCard({
  children,
  className = "",
  maxDeg = 5,
}: {
  children: ReactNode;
  className?: string;
  maxDeg?: number;
}) {
  const { ref, handleMouseMove, handleMouseLeave } = useTilt(maxDeg);

  return (
    <div
      ref={ref}
      className={`tilt-card ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  );
}
