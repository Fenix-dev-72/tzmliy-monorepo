import { Link } from "react-router";
import { LangToggle } from "@/components/layout/LangToggle";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { TizimlyLogo, TizimlyWordmark } from "@/components/layout/TizimlyLogo";

export function AuthTopBar() {
  return (
    <div className="flex items-center justify-between px-4 py-4 sm:px-8 sm:py-5">
      <Link to="/" className="flex items-center gap-2">
        <TizimlyLogo size={30} gradientId="authTopBarGoldGrad" />
        <TizimlyWordmark className="text-lg" />
      </Link>
      <div className="flex items-center gap-2.5">
        <LangToggle />
        <ThemeToggle />
      </div>
    </div>
  );
}
