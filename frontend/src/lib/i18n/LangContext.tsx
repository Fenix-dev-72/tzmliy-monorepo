import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "uz" | "ru";

interface LangContextValue {
  lang: Lang;
  toggleLang: () => void;
}

const STORAGE_KEY = "tzmliy_lang";
const LangContext = createContext<LangContextValue | null>(null);

function getInitialLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "ru" ? "ru" : "uz";
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(getInitialLang);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const toggleLang = useCallback(() => setLang((l) => (l === "uz" ? "ru" : "uz")), []);

  return <LangContext.Provider value={{ lang, toggleLang }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LangProvider");
  return ctx;
}
