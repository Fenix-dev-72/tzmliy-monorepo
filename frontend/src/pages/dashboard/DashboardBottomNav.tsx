import { useState } from "react";
import { NavLink } from "react-router";
import { Grip } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useNavItems } from "./DashboardSidebar";
import { DashboardMoreSheet } from "./DashboardMoreSheet";

const content = {
  uz: { more: "Boshqa" },
  ru: { more: "Ещё" },
};

// Mobile/tablet-only (below the lg / 1024px cutoff) -- desktop uses
// DashboardSidebar's hover-expand icon rail instead, never this bar. Shows
// the first 4 items from the shared useNavItems() list (Bosh sahifa/
// Savdolar/Mijozlar/Moliya); "Boshqa" opens DashboardMoreSheet for the rest,
// matching the mockup's `navDef.slice(4)`.
export function DashboardBottomNav() {
  const { lang } = useLang();
  const t = content[lang];
  const items = useNavItems();
  const primary = items.slice(0, 4);
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <nav className="border-card-border bg-background/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-xl lg:hidden">
        <div className="flex items-stretch justify-around px-1 py-1.5">
          {primary.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-medium transition-colors ${
                  isActive ? "text-accent-orange" : "text-foreground-muted"
                }`
              }
            >
              <item.icon size={20} />
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className="text-foreground-muted flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-medium transition-colors"
          >
            <Grip size={20} />
            <span className="truncate">{t.more}</span>
          </button>
        </div>
      </nav>
      <DashboardMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
