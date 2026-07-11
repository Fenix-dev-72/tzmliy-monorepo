import type { ReactNode } from "react";

export function SectionBadge({
  children,
  icon,
  variant = "gold",
}: {
  children: ReactNode;
  icon?: ReactNode;
  variant?: "gold" | "blue";
}) {
  const toneClasses =
    variant === "gold"
      ? "border-primary/25 bg-primary/10 text-primary"
      : "border-secondary/25 bg-secondary/10 text-secondary";

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[13px] font-semibold ${toneClasses}`}
    >
      {icon}
      {children}
    </div>
  );
}

export function SectionHeading({
  badge,
  title,
  subtitle,
  className = "",
}: {
  badge?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto mb-14 max-w-2xl text-center ${className}`}>
      {badge && <div className="mb-4 flex justify-center">{badge}</div>}
      <h2 className="font-heading mb-4 text-[clamp(32px,4vw,48px)] font-extrabold tracking-tight text-foreground">
        {title}
      </h2>
      {subtitle && <p className="text-[17px] text-foreground-muted">{subtitle}</p>}
    </div>
  );
}
