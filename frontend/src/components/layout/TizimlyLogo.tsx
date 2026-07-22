// Flow/checklist glyph: two "grid" nodes feed into a "list" node, which feeds
// into a "checkmark" node (a process being completed), which feeds into a
// final "list" node (the completed result) -- three inputs, one converging
// process. Replaces the earlier plain 4-square grid mark.
export function TizimlyLogo({ size = 36, gradientId = "tizimlyGoldGrad" }: { size?: number; gradientId?: string }) {
  const mark = "#0A0E1A";
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      {/* connectors, drawn first so nodes sit on top */}
      <path d="M4.5 8 L18 12.5" stroke={`url(#${gradientId})`} strokeWidth="2" strokeLinecap="round" />
      <path d="M31.5 8 L18 12.5" stroke={`url(#${gradientId})`} strokeWidth="2" strokeLinecap="round" />
      <line x1="18" y1="16" x2="18" y2="17" stroke={`url(#${gradientId})`} strokeWidth="2" strokeLinecap="round" />
      <line x1="18" y1="24" x2="18" y2="25" stroke={`url(#${gradientId})`} strokeWidth="2" strokeLinecap="round" />

      {/* top-left grid node */}
      <rect x="1" y="1" width="7" height="7" rx="2" fill={`url(#${gradientId})`} opacity="0.9" />
      <circle cx="3.2" cy="3.2" r="0.7" fill={mark} opacity="0.6" />
      <circle cx="5.8" cy="3.2" r="0.7" fill={mark} opacity="0.6" />
      <circle cx="3.2" cy="5.8" r="0.7" fill={mark} opacity="0.6" />
      <circle cx="5.8" cy="5.8" r="0.7" fill={mark} opacity="0.6" />

      {/* top-right grid node */}
      <rect x="28" y="1" width="7" height="7" rx="2" fill={`url(#${gradientId})`} opacity="0.9" />
      <circle cx="30.2" cy="3.2" r="0.7" fill={mark} opacity="0.6" />
      <circle cx="32.8" cy="3.2" r="0.7" fill={mark} opacity="0.6" />
      <circle cx="30.2" cy="5.8" r="0.7" fill={mark} opacity="0.6" />
      <circle cx="32.8" cy="5.8" r="0.7" fill={mark} opacity="0.6" />

      {/* middle list node */}
      <rect x="14" y="9" width="8" height="7" rx="2" fill={`url(#${gradientId})`} opacity="0.7" />
      <line x1="16" y1="11" x2="20" y2="11" stroke={mark} strokeWidth="0.8" opacity="0.6" strokeLinecap="round" />
      <line x1="16" y1="12.5" x2="20" y2="12.5" stroke={mark} strokeWidth="0.8" opacity="0.6" strokeLinecap="round" />
      <line x1="16" y1="14" x2="19" y2="14" stroke={mark} strokeWidth="0.8" opacity="0.6" strokeLinecap="round" />

      {/* checkmark node */}
      <rect x="14" y="17" width="8" height="7" rx="2" fill={`url(#${gradientId})`} />
      <path d="M15.7 20.5 L17.3 22 L20.3 18.7" stroke={mark} strokeWidth="1.1" fill="none" strokeLinecap="round" strokeLinejoin="round" />

      {/* bottom list node (result) */}
      <rect x="14" y="25" width="8" height="7" rx="2" fill={`url(#${gradientId})`} opacity="0.85" />
      <line x1="16" y1="27" x2="20" y2="27" stroke={mark} strokeWidth="0.8" opacity="0.6" strokeLinecap="round" />
      <line x1="16" y1="28.5" x2="20" y2="28.5" stroke={mark} strokeWidth="0.8" opacity="0.6" strokeLinecap="round" />
      <line x1="16" y1="30" x2="19" y2="30" stroke={mark} strokeWidth="0.8" opacity="0.6" strokeLinecap="round" />

      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E8C874" />
          <stop offset="100%" stopColor="#B8860B" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function TizimlyWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-heading font-extrabold tracking-[0.08em] gold-gradient-text ${className}`}>Tizimly</span>
  );
}
