import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="bg-background/80 absolute inset-0 backdrop-blur-sm" onClick={onCancel} />
      <div className="glass-card auth-card-enter relative w-full max-w-sm p-6">
        <h3 className="font-heading mb-2 text-lg font-bold text-foreground">{title}</h3>
        {description && <p className="mb-4 text-sm text-foreground-muted">{description}</p>}
        {children}
        <div className="mt-5 flex gap-3">
          <Button
            variant={destructive ? "destructive" : "gold"}
            className="flex-1"
            disabled={loading}
            onClick={onConfirm}
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {confirmLabel}
          </Button>
          <Button variant="outline" className="flex-1" disabled={loading} onClick={onCancel}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
