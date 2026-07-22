import { Sun, Moon } from "lucide-react";
import { useThemeContext } from "@/lib/theme/ThemeContext";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { isDark, toggleTheme } = useThemeContext();
  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className={`flex size-9 items-center justify-center rounded-lg border border-card-border text-primary transition-colors hover:bg-accent ${className}`}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
