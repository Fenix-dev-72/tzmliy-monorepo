import { useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";

export interface IntegrationField {
  key: string;
  label: string;
  secret?: boolean;
  optional?: boolean;
  placeholder?: string;
}

export function IntegrationCard({
  icon: Icon,
  brandColor,
  name,
  connected,
  fields,
  onSubmit,
  connectLabel,
  connectedLabel,
  editLabel,
  submitLabel,
  hint,
  connectedInfo,
  onDisconnect,
  disconnectLabel,
  readOnly,
}: {
  icon: LucideIcon;
  brandColor: string;
  name: string;
  connected: boolean;
  fields: IntegrationField[];
  onSubmit: (values: Record<string, string>) => Promise<void>;
  connectLabel: string;
  connectedLabel: string;
  // Text on the main toggle button once connected -- distinct from
  // connectedLabel (the status-dot caption, e.g. "Ulangan"), since clicking
  // this button re-opens the same form to change the stored credentials
  // (2026-07-17: this toggle already existed, it just wasn't labeled as an
  // edit action). Falls back to connectedLabel if omitted, so existing
  // callers that don't pass it keep their old behavior.
  editLabel?: string;
  submitLabel: string;
  // Optional short explanatory line shown above the fields once the form is
  // open -- e.g. UTEL's real quick-connect form (CallsPage.tsx) uses this to
  // clarify that entering the tenant's UTEL login here sets everything up
  // automatically, no manual UTEL dashboard step needed.
  hint?: string;
  // Shown instead of the form while connected and not editing (e.g. webhook
  // URL/secret CopyBoxes) -- disappears while the edit form is open so the
  // two don't compete for space.
  connectedInfo?: ReactNode;
  // Optional -- only one credential can ever exist per tenant+provider (a
  // fresh onSubmit always overwrites it, i.e. "change"); this is the other
  // half, "remove with no replacement". Omitted for integrations that don't
  // support/need disconnecting.
  onDisconnect?: () => Promise<void>;
  disconnectLabel?: string;
  // Own-data scoping (2026-07-22): hides the connect/edit/disconnect
  // controls for a caller without crm.manage -- they can still see the
  // connected status + connectedInfo (webhook URL/secret, crm.view-gated on
  // the backend), just can't change credentials.
  readOnly?: boolean;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const canSubmit = fields.every((f) => f.optional || (values[f.key] ?? "").trim().length > 0);

  async function handleSubmit() {
    setSaving(true);
    try {
      await onSubmit(values);
      setFormOpen(false);
      setValues({});
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!onDisconnect) return;
    setDisconnecting(true);
    try {
      await onDisconnect();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="glass-card p-5 transition-all hover:-translate-y-1">
      <div className="flex items-center gap-3">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${brandColor}18`, color: brandColor }}
        >
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-foreground">{name}</div>
          <div className="flex items-center gap-1.5 text-xs text-foreground-muted">
            <span
              className="size-1.5 rounded-full"
              style={{ background: connected ? "#2FBF71" : "var(--card-border)" }}
            />
            {connected ? connectedLabel : "—"}
          </div>
        </div>
        {!readOnly && (
          <Button variant={connected ? "outline" : "gold"} size="sm" onClick={() => setFormOpen((o) => !o)}>
            {connected ? (editLabel ?? connectedLabel) : connectLabel}
          </Button>
        )}
        {!readOnly && connected && onDisconnect && (
          <Button variant="outline" size="sm" disabled={disconnecting} onClick={handleDisconnect}>
            {disconnecting && <Loader2 size={14} className="animate-spin" />}
            {disconnectLabel}
          </Button>
        )}
      </div>

      {connected && connectedInfo && !formOpen && <div className="mt-4 border-t border-card-border/60 pt-4">{connectedInfo}</div>}

      {!readOnly && formOpen && (
        <div className="mt-4 border-t border-card-border/60 pt-4">
          {hint && <p className="mb-3 text-xs text-foreground-muted">{hint}</p>}
          {fields.map((f) => (
            <FormField
              key={f.key}
              label={f.label}
              type={f.secret && !reveal[f.key] ? "password" : "text"}
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              rightEl={
                f.secret ? (
                  <button
                    type="button"
                    onClick={() => setReveal((r) => ({ ...r, [f.key]: !r[f.key] }))}
                    className="text-foreground-muted"
                  >
                    {reveal[f.key] ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                ) : undefined
              }
            />
          ))}
          <Button variant="gold" size="sm" disabled={!canSubmit || saving} onClick={handleSubmit} className="mt-1">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {submitLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
