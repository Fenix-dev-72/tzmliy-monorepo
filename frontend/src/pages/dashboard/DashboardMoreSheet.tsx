import { useEffect } from "react";
import { NavLink } from "react-router";
import { ShieldAlert, X } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useNavItems } from "./DashboardSidebar";

const content = {
  uz: { title: "Boshqa" },
  ru: { title: "Ещё" },
};

// Mobile/tablet-only (below lg) bottom sheet -- shows everything past the 4
// primary DashboardBottomNav tabs, i.e. useNavItems().slice(4), mirroring the
// mockup's `navDef.slice(4)` exactly. Desktop never opens this -- it gets the
// full list directly in DashboardSidebar's hover-expand rail instead.
export function DashboardMoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang } = useLang();
  const t = content[lang];
  const items = useNavItems().slice(4);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="bg-background/70 absolute inset-0 backdrop-blur-sm" onClick={onClose} />
      <div className="border-card-border bg-background absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-3xl border-t pt-3 pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-2xl">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/15" />
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 className="font-heading text-base font-bold text-foreground">{t.title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-foreground-muted hover:bg-accent flex size-8 items-center justify-center rounded-lg"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 px-5 pb-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `border-card-border bg-card relative flex flex-col items-center justify-center gap-2 rounded-2xl border px-3 py-5 text-center text-xs font-semibold transition-colors ${
                  isActive ? "border-accent-orange/50 text-accent-orange bg-accent-orange/10" : "text-foreground hover:bg-accent"
                }`
              }
            >
              <item.icon size={20} />
              <span className="leading-tight">{item.label}</span>
              {item.warn && <ShieldAlert size={12} className="text-warning absolute top-2 right-2" />}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}
