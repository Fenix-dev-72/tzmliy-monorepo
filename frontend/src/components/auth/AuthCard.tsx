import type { ReactNode } from "react";
import { cn } from "@/components/ui/utils";

export function AuthCard({
  children,
  maxWidth = "440px",
  className,
}: {
  children: ReactNode;
  maxWidth?: string;
  className?: string;
}) {
  return (
    <div className={cn("glass-card gold-hairline w-full p-6 sm:p-10", className)} style={{ maxWidth }}>
      {children}
    </div>
  );
}
