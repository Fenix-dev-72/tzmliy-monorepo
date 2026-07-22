const AMBER = "#F59E0B";
const GREEN = "#10B981";
const RED = "#EF4444";
const GRAY = "#8B93A7";

const STATUS_COLOR: Record<string, string> = {
  active: AMBER,
  pending: AMBER,
  answered: GREEN,
  completed: GREEN,
  approved: GREEN,
  sent: GREEN,
  customer: GREEN,
  cancelled: RED,
  rejected: RED,
  missed: RED,
  failed: RED,
  lost: RED,
  dead_letter: RED,
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const color = STATUS_COLOR[status] ?? GRAY;
  return (
    <span
      className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: `${color}15`, borderColor: `${color}30`, color }}
    >
      {label}
    </span>
  );
}
