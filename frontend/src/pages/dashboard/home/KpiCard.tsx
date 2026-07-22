import type { ReactNode } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import type { LucideIcon } from "lucide-react";

export function KpiCard({
  icon: Icon,
  iconColor,
  label,
  value,
  growthLabel,
  growthDirection = "neutral",
  sparkline,
  delayMs = 0,
}: {
  icon: LucideIcon;
  iconColor: string;
  label: string;
  value: ReactNode;
  growthLabel?: string;
  growthDirection?: "up" | "down" | "neutral";
  sparkline?: number[];
  delayMs?: number;
}) {
  const growthColor =
    growthDirection === "up" ? "var(--success)" : growthDirection === "down" ? "var(--destructive)" : "var(--foreground-muted)";
  const sparklineData = (sparkline ?? []).map((v, i) => ({ i, v }));

  return (
    <div
      className="glass-card card-hover-lift auth-card-enter flex flex-col gap-3 p-5 sm:p-6"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: `${iconColor}18` }}
        >
          <Icon size={20} color={iconColor} strokeWidth={1.75} />
        </div>
        <span className="text-sm font-medium text-foreground-muted">{label}</span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {value}
          {growthLabel && (
            <div className="mt-1 text-xs font-semibold" style={{ color: growthColor }}>
              {growthDirection === "up" ? "▲ " : growthDirection === "down" ? "▼ " : ""}
              {growthLabel}
            </div>
          )}
        </div>

        {sparklineData.length > 1 && (
          <div className="h-10 w-20 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparklineData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={`kpiGrad-${label}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={iconColor} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={iconColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke={iconColor} fill={`url(#kpiGrad-${label})`} strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
