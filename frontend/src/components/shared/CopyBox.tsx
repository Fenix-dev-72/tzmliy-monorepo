import { useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";

// Extracted from IntegrationsPage.tsx (2026-07-17), reused by CallsPage.tsx --
// both pages show a provider's own webhook URL/secret once connected.

export function CopyBox({
  hint,
  label,
  value,
  secret,
}: {
  hint?: string;
  label: string;
  value: string;
  // Masks the value behind dots by default with an eye toggle to reveal it
  // (2026-07-17, explicit request: tokens/secrets shouldn't sit in plaintext
  // on screen) -- mirrors IntegrationCard's own password-field reveal
  // pattern. Omit for values that aren't actually sensitive (e.g. a bare
  // informational label).
  secret?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const masked = Boolean(secret) && !revealed;
  const displayValue = masked ? "•".repeat(Math.min(value.length, 32) || 8) : value;

  return (
    <div className="border-primary/25 bg-primary/8 mt-2 rounded-xl border p-3">
      {hint && <p className="mb-1.5 text-xs text-foreground-muted">{hint}</p>}
      <p className="mb-1 text-[11px] font-semibold text-foreground-muted">{label}</p>
      <div className="flex items-center gap-2">
        <code className="bg-background/60 flex-1 truncate rounded-lg px-2.5 py-1.5 text-xs text-foreground">
          {displayValue}
        </code>
        {secret && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="text-foreground-muted shrink-0"
            aria-label={revealed ? "Hide" : "Reveal"}
          >
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="text-foreground-muted shrink-0"
          aria-label="Copy"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}
