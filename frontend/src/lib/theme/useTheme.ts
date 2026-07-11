import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "tzmliy_theme";

function getInitialIsDark(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light") return false;
  if (stored === "dark") return true;
  return true; // dark is the default "hero" mode per design spec
}

export function useTheme() {
  const [isDark, setIsDark] = useState(getInitialIsDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light");
  }, [isDark]);

  const toggleTheme = useCallback(() => setIsDark((d) => !d), []);

  return { isDark, toggleTheme };
}
