import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/ui/utils";
import { AlertCircle } from "lucide-react";

interface FormFieldProps extends React.ComponentProps<"input"> {
  label: string;
  error?: string;
  rightEl?: ReactNode;
  hint?: string;
}

export function FormField({ label, error, rightEl, hint, className, ...props }: FormFieldProps) {
  return (
    <div className="mb-4">
      <Label className="mb-1.5">{label}</Label>
      <div className="relative">
        <Input aria-invalid={Boolean(error)} className={cn(rightEl && "pr-11", className)} {...props} />
        {rightEl && <div className="absolute top-1/2 right-3 -translate-y-1/2">{rightEl}</div>}
      </div>
      {hint && !error && <p className="mt-1.5 text-xs text-foreground-muted">{hint}</p>}
      {error && (
        <div className="mt-1.5 flex items-center gap-1">
          <AlertCircle size={12} className="text-destructive" />
          <span className="text-destructive text-xs">{error}</span>
        </div>
      )}
    </div>
  );
}
