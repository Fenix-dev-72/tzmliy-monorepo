import { Globe } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { TzmliyLogo, TzmliyWordmark } from "@/components/layout/TzmliyLogo";

const content = {
  uz: {
    desc: "Ko'p tenantli B2B SaaS platforma — savdo, moliya, CRM va qo'ng'iroqlar boshqaruvi.",
    product: "Mahsulot",
    company: "Kompaniya",
    legal: "Huquqiy",
    productLinks: ["Imkoniyatlar", "Tariflar", "Integratsiyalar", "API hujjatlar", "So'nggi yangiliklar"],
    companyLinks: ["Biz haqimizda", "Blog", "Karyera", "Hamkorlar", "Aloqa"],
    legalLinks: ["Maxfiylik siyosati", "Foydalanish shartlari", "Cookie siyosati", "SLA"],
    copyright: "© 2026 Tzmliy. Barcha huquqlar himoyalangan.",
  },
  ru: {
    desc: "Мультитенантная B2B SaaS платформа — управление продажами, финансами, CRM и звонками.",
    product: "Продукт",
    company: "Компания",
    legal: "Правовое",
    productLinks: ["Возможности", "Тарифы", "Интеграции", "Документация API", "Новости"],
    companyLinks: ["О нас", "Блог", "Карьера", "Партнёры", "Контакты"],
    legalLinks: ["Политика конфиденциальности", "Условия использования", "Политика cookies", "SLA"],
    copyright: "© 2026 Tzmliy. Все права защищены.",
  },
};

export function Footer() {
  const { lang } = useLang();
  const c = content[lang];

  const columns = [
    { title: c.product, links: c.productLinks },
    { title: c.company, links: c.companyLinks },
    { title: c.legal, links: c.legalLinks },
  ];

  return (
    <footer id="contact" className="bg-background border-card-border border-t px-6 pt-16 pb-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-14 grid grid-cols-1 gap-12 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <div className="mb-4 flex items-center gap-2.5">
              <TzmliyLogo size={28} gradientId="footerGoldGrad" />
              <TzmliyWordmark className="text-xl" />
            </div>
            <p className="mb-5 max-w-[280px] text-sm leading-relaxed text-foreground-muted">{c.desc}</p>
            <div className="flex gap-2.5">
              {["T", "LI", "TG"].map((s) => (
                <div
                  key={s}
                  className="bg-accent border-card-border flex size-9 items-center justify-center rounded-xl border text-[11px] font-bold text-foreground-muted"
                >
                  {s}
                </div>
              ))}
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="font-heading mb-4 text-sm font-bold tracking-wide text-foreground">{col.title}</h4>
              {col.links.map((link) => (
                <a
                  key={link}
                  href="#"
                  className="mb-2.5 block text-sm text-foreground-muted transition-colors hover:text-primary"
                >
                  {link}
                </a>
              ))}
            </div>
          ))}
        </div>

        <div className="border-card-border flex flex-wrap items-center justify-between gap-3 border-t pt-6">
          <span className="text-[13px] text-foreground-muted">{c.copyright}</span>
          <div className="flex items-center gap-1.5 text-foreground-muted">
            <Globe size={14} />
            <span className="text-[13px]">UZ / RU</span>
            <span className="ml-3 text-[13px]">UZS / USD</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
