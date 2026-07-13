import { Globe } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";

export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, toggleLang } = useLang();
  return (
    <button
      onClick={toggleLang}
      className={`flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-1.5 text-[13px] font-semibold text-foreground-muted transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-90 ${className}`}
    >
      <Globe size={14} />
      {lang.toUpperCase()}
    </button>
  );
}
