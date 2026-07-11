import { useState } from "react";
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
  submitLabel,
}: {
  icon: LucideIcon;
  brandColor: string;
  name: string;
  connected: boolean;
  fields: IntegrationField[];
  onSubmit: (values: Record<string, string>) => Promise<void>;
  connectLabel: string;
  connectedLabel: string;
  submitLabel: string;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

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
        <Button variant={connected ? "outline" : "gold"} size="sm" onClick={() => setFormOpen((o) => !o)}>
          {connected ? connectedLabel : connectLabel}
        </Button>
      </div>

      {formOpen && (
        <div className="mt-4 border-t border-card-border/60 pt-4">
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
