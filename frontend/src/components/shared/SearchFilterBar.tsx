import { Search } from "lucide-react";

// Search box + pill filter tabs toolbar, matching the mockup's Sales/
// Customers/Calls list-page header (search input + status/stage filter
// pills). Added 2026-07-27 -- none of the dashboard list pages had a text
// search box before this, and each hand-rolled its own filter-tab styling.
export function SearchFilterBar<T extends string>({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filters,
  activeFilter,
  onFilterChange,
}: {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: { value: T; label: string }[];
  activeFilter?: T;
  onFilterChange?: (value: T) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {onSearchChange && (
        <div className="border-card-border bg-input-background flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-xl border px-3 sm:max-w-xs">
          <Search size={14} className="text-foreground-muted shrink-0" />
          <input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="text-foreground placeholder:text-foreground-muted w-full bg-transparent text-sm outline-none"
          />
        </div>
      )}
      {filters && filters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => onFilterChange?.(f.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                activeFilter === f.value
                  ? "border-accent-orange/40 bg-accent-orange/12 text-accent-orange"
                  : "border-card-border text-foreground-muted hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
