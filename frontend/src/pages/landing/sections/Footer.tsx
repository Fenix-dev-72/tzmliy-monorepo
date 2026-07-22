import { Link } from "react-router";
import { Send, Camera, Briefcase, MapPin, Mail } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { TizimlyLogo, TizimlyWordmark } from "@/components/layout/TizimlyLogo";

// Closing footer (reference: TeamWave/Framer template's 4-column footer).
// "Useful links" (privacy/terms) and social links point at "#" -- no
// privacy-policy/terms page or real social accounts exist yet in this repo,
// same "visual placeholder, not a fabricated real link" precedent as
// CTASection's newsletter form. Menu column links to real routes
// (/, #features, #pricing, #integrations, /login, /register) where they
// exist.

const content = {
  uz: {
    tagline: "Savdo, moliya, CRM va analitikani bitta platformada birlashtiruvchi multi-tenant B2B SaaS.",
    menu: "Menyu",
    menuLinks: [
      { label: "Bosh sahifa", href: "/" },
      { label: "Imkoniyatlar", href: "#features" },
      { label: "Tariflar", href: "#pricing" },
      { label: "Integratsiyalar", href: "#integrations" },
      { label: "Kirish", href: "/login" },
    ],
    useful: "Foydali havolalar",
    usefulLinks: [
      { label: "Maxfiylik siyosati", href: "#" },
      { label: "Foydalanish shartlari", href: "#" },
      { label: "Yordam markazi", href: "#" },
    ],
    social: "Ijtimoiy tarmoqlar",
    contactTitle: "Bog'lanish",
    address: "Toshkent, O'zbekiston",
    email: "info@tizimly.uz",
    copyright: `© ${new Date().getFullYear()} Tizimly. Barcha huquqlar himoyalangan.`,
  },
  ru: {
    tagline: "Multi-tenant B2B SaaS, объединяющий продажи, финансы, CRM и аналитику на одной платформе.",
    menu: "Меню",
    menuLinks: [
      { label: "Главная", href: "/" },
      { label: "Возможности", href: "#features" },
      { label: "Тарифы", href: "#pricing" },
      { label: "Интеграции", href: "#integrations" },
      { label: "Войти", href: "/login" },
    ],
    useful: "Полезные ссылки",
    usefulLinks: [
      { label: "Политика конфиденциальности", href: "#" },
      { label: "Условия использования", href: "#" },
      { label: "Центр поддержки", href: "#" },
    ],
    social: "Соцсети",
    contactTitle: "Контакты",
    address: "Ташкент, Узбекистан",
    email: "info@tizimly.uz",
    copyright: `© ${new Date().getFullYear()} Tizimly. Все права защищены.`,
  },
};

export function Footer() {
  const { lang } = useLang();
  const t = content[lang];

  return (
    <footer className="border-card-border border-t">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="mb-4 flex items-center gap-2">
              <TizimlyLogo size={26} gradientId="footerLogoGrad" />
              <TizimlyWordmark className="h-5" />
            </div>
            <p className="text-foreground-muted max-w-xs text-sm leading-relaxed">{t.tagline}</p>
          </div>

          <div>
            <h4 className="text-foreground-muted mb-4 text-xs font-semibold tracking-wide uppercase">{t.menu}</h4>
            <ul className="space-y-3">
              {t.menuLinks.map((link) =>
                link.href.startsWith("#") ? (
                  <li key={link.label}>
                    <a href={link.href} className="hover:text-primary text-sm transition-colors">
                      {link.label}
                    </a>
                  </li>
                ) : (
                  <li key={link.label}>
                    <Link to={link.href} className="hover:text-primary text-sm transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </div>

          <div>
            <h4 className="text-foreground-muted mb-4 text-xs font-semibold tracking-wide uppercase">{t.useful}</h4>
            <ul className="space-y-3">
              {t.usefulLinks.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="hover:text-primary text-sm transition-colors">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>

            <h4 className="text-foreground-muted mt-8 mb-4 text-xs font-semibold tracking-wide uppercase">{t.social}</h4>
            <div className="flex items-center gap-3">
              <a
                href="#"
                aria-label="Telegram"
                className="border-card-border hover:border-primary hover:text-primary flex size-9 items-center justify-center rounded-full border transition-colors"
              >
                <Send size={15} />
              </a>
              <a
                href="#"
                aria-label="Instagram"
                className="border-card-border hover:border-primary hover:text-primary flex size-9 items-center justify-center rounded-full border transition-colors"
              >
                <Camera size={15} />
              </a>
              <a
                href="#"
                aria-label="LinkedIn"
                className="border-card-border hover:border-primary hover:text-primary flex size-9 items-center justify-center rounded-full border transition-colors"
              >
                <Briefcase size={15} />
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-foreground-muted mb-4 text-xs font-semibold tracking-wide uppercase">{t.contactTitle}</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <MapPin size={15} className="text-foreground-muted mt-0.5 shrink-0" />
                <span>{t.address}</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail size={15} className="text-foreground-muted shrink-0" />
                <a href={`mailto:${t.email}`} className="hover:text-primary transition-colors">
                  {t.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-card-border text-foreground-muted mt-12 flex flex-col items-center justify-center gap-2 border-t pt-8 text-xs sm:flex-row sm:justify-between">
          <span>{t.copyright}</span>
        </div>
      </div>
    </footer>
  );
}
