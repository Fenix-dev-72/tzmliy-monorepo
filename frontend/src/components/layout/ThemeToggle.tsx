import { Sun, Moon } from "lucide-react";
import { useThemeContext } from "@/lib/theme/ThemeContext";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { isDark, toggleTheme } = useThemeContext();
  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className={`flex size-9 items-center justify-center rounded-lg border border-card-border text-primary transition-all duration-200 hover:bg-accent active:scale-90 ${className}`}
    >
      <span className="inline-flex transition-transform duration-500 ease-out" style={{ transform: isDark ? "rotate(0deg)" : "rotate(180deg)" }}>
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </span>
    </button>
  );
}
