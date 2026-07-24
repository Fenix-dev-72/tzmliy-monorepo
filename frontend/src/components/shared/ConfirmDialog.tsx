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
  wide = false,
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
  // A plain yes/no confirmation reads fine at max-w-sm, but a few callers
  // (NotificationsPage's schedule editor) reuse this same dialog shell for
  // a real multi-field form -- squeezed into 384px, every select/checkbox
  // row wrapped awkwardly and the dialog could grow taller than the
  // viewport with no internal scroll at all (found live, 2026-07-24, "juda
  // yomon ko'rinmoqda" on desktop). `wide` widens the card AND caps its
  // height with its own scroll region, instead of the whole page scrolling
  // to reach content past the viewport edge -- same "bounded list gets its
  // own overflow-y-auto" convention this repo already uses elsewhere
  // (NotificationsPage's own max-h-40 user checklist a few lines below).
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="bg-background/80 absolute inset-0 backdrop-blur-sm" onClick={onCancel} />
      <div
        className={`glass-card auth-card-enter relative flex w-full flex-col p-6 ${wide ? "max-w-2xl max-h-[90vh]" : "max-w-sm"}`}
      >
        <h3 className="font-heading mb-2 text-lg font-bold text-foreground">{title}</h3>
        {description && <p className="mb-4 text-sm text-foreground-muted">{description}</p>}
        {wide ? <div className="min-h-0 flex-1 overflow-y-auto pr-1">{children}</div> : children}
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
