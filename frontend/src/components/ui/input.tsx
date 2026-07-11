import * as React from "react";

import { cn } from "./utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-11 w-full min-w-0 rounded-xl border border-card-border bg-input-background px-3.5 py-2 text-sm text-foreground outline-none transition-all placeholder:text-foreground-muted",
        "focus-visible:border-ring focus-visible:ring-ring/15 focus-visible:ring-[3px]",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/15",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
