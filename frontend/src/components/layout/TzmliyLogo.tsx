export function TzmliyLogo({ size = 36, gradientId = "tzmliyGoldGrad" }: { size?: number; gradientId?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect x="2" y="2" width="14" height="14" rx="3" fill={`url(#${gradientId})`} opacity="0.9" />
      <rect x="20" y="2" width="14" height="14" rx="3" fill={`url(#${gradientId})`} opacity="0.6" />
      <rect x="2" y="20" width="14" height="14" rx="3" fill={`url(#${gradientId})`} opacity="0.6" />
      <rect x="20" y="20" width="14" height="14" rx="3" fill={`url(#${gradientId})`} opacity="0.3" />
      <line x1="16" y1="9" x2="20" y2="9" stroke={`url(#${gradientId})`} strokeWidth="2" />
      <line x1="9" y1="16" x2="9" y2="20" stroke={`url(#${gradientId})`} strokeWidth="2" />
      <line x1="27" y1="16" x2="27" y2="20" stroke={`url(#${gradientId})`} strokeWidth="2" />
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E8C874" />
          <stop offset="100%" stopColor="#B8860B" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function TzmliyWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-heading font-extrabold tracking-[0.08em] gold-gradient-text ${className}`}
    >
      Tzmliy
    </span>
  );
}
