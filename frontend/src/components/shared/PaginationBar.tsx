import { ChevronLeft, ChevronRight } from "lucide-react";

// Numbered pagination (2026-07-28) -- replaces the "Ko'proq yuklash" /
// load-more pattern that used to accumulate an ever-growing in-memory list.
// Always shows first/last page + up to 5 pages around the current one, with
// "…" gaps, same convention as most catalog/streaming sites.
function pageRange(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1, current - 2, current + 2]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("gap");
    result.push(sorted[i]);
  }
  return result;
}

export function PaginationBar({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-4 flex items-center justify-center gap-1.5">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="previous page"
        className="border-card-border text-foreground-muted hover:text-foreground flex size-9 items-center justify-center rounded-lg border disabled:opacity-40"
      >
        <ChevronLeft size={15} />
      </button>

      {pageRange(page, totalPages).map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} className="text-foreground-muted px-1 text-sm">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`flex size-9 items-center justify-center rounded-lg text-sm font-semibold ${
              p === page ? "bg-accent-orange text-accent-orange-foreground" : "text-foreground-muted hover:bg-accent hover:text-foreground"
            }`}
          >
            {p}
          </button>
        ),
      )}

      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="next page"
        className="border-card-border text-foreground-muted hover:text-foreground flex size-9 items-center justify-center rounded-lg border disabled:opacity-40"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  );
}
