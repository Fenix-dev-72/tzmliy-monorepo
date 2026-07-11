import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Menu, X } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { TzmliyLogo, TzmliyWordmark } from "@/components/layout/TzmliyLogo";
import { LangToggle } from "@/components/layout/LangToggle";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

const translations = {
  uz: {
    features: "Imkoniyatlar",
    pricing: "Tariflar",
    integrations: "Integratsiyalar",
    contact: "Aloqa",
    login: "Kirish",
    start: "Bepul boshlash",
  },
  ru: {
    features: "Возможности",
    pricing: "Тарифы",
    integrations: "Интеграции",
    contact: "Контакты",
    login: "Войти",
    start: "Начать бесплатно",
  },
};

export function Navbar() {
  const { lang } = useLang();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const t = translations[lang];

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const navLinks = [
    { label: t.features, href: "#features" },
    { label: t.pricing, href: "#pricing" },
    { label: t.integrations, href: "#integrations" },
    { label: t.contact, href: "#contact" },
  ];

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-[100] transition-all duration-300 ${
        scrolled ? "bg-background/90 border-b border-card-border backdrop-blur-xl" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
          <TzmliyLogo />
          <TzmliyWordmark className="text-[22px]" />
        </div>

        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[15px] font-medium text-foreground-muted transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <LangToggle className="hidden sm:inline-flex" />
          <ThemeToggle />

          <Link
            to="/login"
            className="hidden rounded-lg border border-card-border px-4.5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent md:block"
          >
            {t.login}
          </Link>

          <Link
            to="/register"
            className="gold-gradient-bg hidden rounded-lg px-5 py-2 text-sm font-bold text-[#0A0E1A] shadow-[0_4px_16px_rgba(212,175,55,0.3)] transition-opacity hover:opacity-90 md:block"
          >
            {t.start}
          </Link>

          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex size-9 items-center justify-center rounded-lg border border-card-border text-foreground md:hidden"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="bg-background/95 border-t border-card-border px-6 py-5 backdrop-blur-xl">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="block border-b border-card-border py-3 text-base font-medium text-foreground-muted"
            >
              {link.label}
            </a>
          ))}
          <div className="mt-5 flex gap-3">
            <Link
              to="/login"
              className="flex-1 rounded-lg border border-card-border py-2.5 text-center text-sm font-semibold text-foreground"
            >
              {t.login}
            </Link>
            <Link
              to="/register"
              className="gold-gradient-bg flex-1 rounded-lg py-2.5 text-center text-sm font-bold text-[#0A0E1A]"
            >
              {t.start}
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
