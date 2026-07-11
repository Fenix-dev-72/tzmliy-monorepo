import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { useLang } from "@/lib/i18n/LangContext";
import { LangToggle } from "@/components/layout/LangToggle";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export function AuthTopBar() {
  const { lang } = useLang();
  return (
    <div className="flex items-center justify-between px-4 py-4 sm:px-8 sm:py-5">
      <Link
        to="/"
        className="flex items-center gap-1.5 text-[13px] font-medium text-foreground-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} />
        <span className="hidden sm:inline">{lang === "uz" ? "Asosiy sahifa" : "Главная страница"}</span>
      </Link>
      <div className="flex items-center gap-2.5">
        <LangToggle />
        <ThemeToggle />
      </div>
    </div>
  );
}
