import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { FileText, Package, Plus, ShoppingCart, UserPlus } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";

const content = {
  uz: {
    newSale: "Yangi savdo",
    newCustomer: "Yangi mijoz",
    newProduct: "Yangi mahsulot",
    newInvoice: "Yangi hisob-faktura",
  },
  ru: {
    newSale: "Новая продажа",
    newCustomer: "Новый клиент",
    newProduct: "Новый товар",
    newInvoice: "Новый счёт",
  },
};

export function FloatingActionButton() {
  const { lang } = useLang();
  const t = content[lang];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const items = [
    { to: "/dashboard/sales", icon: ShoppingCart, label: t.newSale },
    { to: "/dashboard/customers", icon: UserPlus, label: t.newCustomer },
    { to: "/dashboard/products", icon: Package, label: t.newProduct },
    { to: "/dashboard/finance", icon: FileText, label: t.newInvoice },
  ];

  return (
    <div ref={ref} className="fixed right-5 bottom-20 z-30 sm:right-8 sm:bottom-8">
      {open && (
        <div className="glass-card card-hover-lift absolute right-0 bottom-full mb-3 w-56 overflow-hidden p-1.5">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className="hover:bg-accent flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors"
            >
              <item.icon size={16} className="text-accent-orange shrink-0" />
              {item.label}
            </Link>
          ))}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Quick create"
        aria-expanded={open}
        className="bg-accent-orange text-accent-orange-foreground flex size-14 items-center justify-center rounded-full shadow-lg transition-transform duration-200 hover:scale-105 active:scale-95"
        style={{ boxShadow: "0 8px 24px rgba(249, 115, 22, 0.4)" }}
      >
        <Plus size={24} className={`transition-transform duration-200 ${open ? "rotate-45" : ""}`} />
      </button>
    </div>
  );
}
