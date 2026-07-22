import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Menu, X } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { TizimlyLogo, TizimlyWordmark } from "@/components/layout/TizimlyLogo";
import { LangToggle } from "@/components/layout/LangToggle";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

// Floating "capsule" navbar (2026-07-20 landing rebuild, refined 2026-07-21
// for transparency + utility-control spacing). Lang/theme toggles are
// visually grouped into their own compact, borderless pill (separated from
// the login/register cluster by a thin divider) instead of sitting as two
// separate bordered shapes crammed against the nav links -- that's what read
// as "badly placed" before. The capsule itself is noticeably more
// see-through now (lower bg opacity), especially before scrolling.

const content = {
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
  const t = content[lang];
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // "/#section" (not bare "#section") so the links still work when Navbar is
  // rendered on a non-landing page (login/register/OTP) -- clicking one from
  // there does a real navigation to "/" and the browser scrolls to the
  // fragment on its own; from "/" itself this behaves identically to a bare
  // "#section" anchor (fragment-only navigation never reloads the page).
  const links = [
    { label: t.features, href: "/#features" },
    { label: t.pricing, href: "/#pricing" },
    { label: t.integrations, href: "/#integrations" },
    { label: t.contact, href: "/#contact" },
  ];

  return (
    <div className="fixed inset-x-0 top-3 z-[100] px-3 sm:top-4 sm:px-6">
      {/* soft brand glow behind the capsule */}
      <div
        className="pointer-events-none absolute top-0 left-1/2 h-24 w-[min(680px,92%)] -translate-x-1/2 rounded-full blur-2xl"
        style={{ background: "radial-gradient(ellipse at center, rgba(212,175,55,0.14) 0%, transparent 70%)" }}
      />

      <nav
        className={`relative mx-auto flex max-w-6xl items-center justify-between rounded-full border px-4 py-2 backdrop-blur-xl transition-all duration-300 sm:px-5 ${
          scrolled
            ? "border-card-border/60 bg-card/45 shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
            : "border-white/5 bg-card/20 shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
        }`}
      >
        {/* logo */}
        <Link to="/" className="flex shrink-0 items-center gap-2 pl-1.5 sm:pl-2">
          <TizimlyLogo size={28} />
          <TizimlyWordmark className="text-lg" />
        </Link>

        {/* centered nav links (desktop) -- only appears from xl (1280px) up,
            not lg (1024px): at 1024-1280px there isn't reliably enough room
            between the logo and the right-side controls for these
            absolutely-centered links to avoid overlapping them (found via a
            real-browser check, 2026-07-21). Below xl, the hamburger covers
            navigation instead -- no collision risk. */}
        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-6 xl:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-foreground-muted hover:text-foreground text-sm font-medium whitespace-nowrap transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* right controls */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {/* utility cluster: lang + theme grouped into one compact, borderless pill */}
          <div className="border-card-border/50 bg-background/25 hidden items-center gap-0.5 rounded-full border p-0.5 sm:flex">
            <LangToggle className="!gap-1 !rounded-full !border-0 !bg-transparent !px-2.5 !py-1.5 !text-xs" />
            <ThemeToggle className="!size-7 !rounded-full !border-0 !bg-transparent" />
          </div>

          {/* divider separating utility controls from auth actions */}
          <div className="bg-card-border/60 mx-1 hidden h-5 w-px sm:block" />

          <Link
            to="/login"
            className="text-foreground-muted hover:text-foreground hidden px-2 text-sm font-semibold whitespace-nowrap transition-colors md:block"
          >
            {t.login}
          </Link>
          <Link
            to="/register"
            className="gold-gradient-bg ml-1 hidden rounded-full px-5 py-2 text-sm font-bold whitespace-nowrap text-[#0A0E1A] shadow-[0_4px_16px_rgba(212,175,55,0.3)] transition-opacity hover:opacity-90 sm:block"
          >
            {t.start}
          </Link>

          {/* mobile hamburger */}
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Menu"
            className="border-card-border/60 bg-background/25 text-foreground flex size-9 items-center justify-center rounded-full border xl:hidden"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </nav>

      {/* mobile dropdown menu */}
      {open && (
        <div className="relative mx-auto mt-2 max-w-5xl xl:hidden">
          <div
            className="pointer-events-none absolute -inset-px rounded-3xl opacity-60 blur-md"
            style={{ background: "linear-gradient(135deg, rgba(212,175,55,0.35), rgba(76,111,255,0.25))" }}
          />
          <div className="border-card-border bg-card/95 relative flex flex-col items-center gap-1 rounded-3xl border p-4 backdrop-blur-xl">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-foreground w-full rounded-2xl py-3 text-center text-base font-medium transition-colors hover:bg-white/5"
              >
                {link.label}
              </a>
            ))}

            <div className="border-card-border/50 bg-background/30 my-2 flex items-center gap-0.5 rounded-full border p-0.5">
              <LangToggle className="!rounded-full !border-0 !bg-transparent" />
              <div className="bg-card-border/60 h-4 w-px" />
              <ThemeToggle className="!rounded-full !border-0 !bg-transparent" />
            </div>

            <Link
              to="/login"
              onClick={() => setOpen(false)}
              className="border-card-border text-foreground w-full rounded-full border py-3 text-center text-sm font-semibold"
            >
              {t.login}
            </Link>
            <Link
              to="/register"
              onClick={() => setOpen(false)}
              className="gold-gradient-bg w-full rounded-full py-3 text-center text-sm font-bold text-[#0A0E1A]"
            >
              {t.start}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
