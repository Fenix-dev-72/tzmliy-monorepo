import type { ReactNode } from "react";

// The "divided card list" pattern used by every entity list in the dashboard
// (Sales, Customers, Calls, Attendance, Users, Sellers, Finance's payroll/
// adjustments lists, Integrations' leads/campaigns lists, Notifications'
// groups/schedules/outbox) -- extracted 2026-07-27 during the mockup reskin
// since it was hand-copied with slightly different padding in ~8 files, and
// two spots (Calls' manager-mapping list, Notifications' schedule rows)
// didn't use it at all. Row radius/padding here match the mockup's list-row
// spec (14px radius, 14px/16px padding) rather than glass-card's panel-level
// 16px radius.
export function EntityListCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bg-card/95 border-card-border overflow-hidden rounded-[14px] border shadow-sm ${className}`}>{children}</div>;
}

export function EntityListRow({
  children,
  isLast = false,
  as = "div",
  onClick,
  className = "",
}: {
  children: ReactNode;
  isLast?: boolean;
  as?: "div" | "button";
  onClick?: () => void;
  className?: string;
}) {
  const rowClass = `flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left sm:p-5 ${
    isLast ? "" : "border-card-border/60 border-b"
  } ${className}`;

  if (as === "button") {
    return (
      <button onClick={onClick} className={`hover:bg-accent/40 transition-colors ${rowClass}`}>
        {children}
      </button>
    );
  }

  return <div className={rowClass}>{children}</div>;
}
