import type { LucideIcon } from "lucide-react";
import { Lock, ShieldCheck, CreditCard, Globe } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { Reveal } from "@/components/shared/Reveal";

// Premium-SaaS-landing-page "trust strip" -- a thin row of credibility
// signals right under the hero, before the (pre-existing, unrelated to this
// pass) stats section. Deliberately NOT customer logos/testimonials --
// Tizimly is pre-launch with zero real paying customers as of this pass
// (confirmed against production), so anything claiming "trusted by X
// companies" here would be fabricated. These four are all things that are
// genuinely true today: real architecture facts (RLS tenant isolation,
// encryption) and real product facts (no-card trial), not manufactured
// social proof.

interface TrustItem {
  icon: LucideIcon;
  label: string;
}

const content = {
  uz: {
    items: [
      { icon: ShieldCheck, label: "RLS-asoslangan tenant izolatsiyasi" },
      { icon: Lock, label: "Shifrlangan ma'lumotlar" },
      { icon: CreditCard, label: "Kartasiz 15 kunlik sinov" },
      { icon: Globe, label: "O'zbek bozoriga moslashtirilgan" },
    ] as TrustItem[],
  },
  ru: {
    items: [
      { icon: ShieldCheck, label: "Изоляция тенантов на базе RLS" },
      { icon: Lock, label: "Шифрование данных" },
      { icon: CreditCard, label: "15-дневный пробный период без карты" },
      { icon: Globe, label: "Адаптировано для рынка Узбекистана" },
    ] as TrustItem[],
  },
};

export function TrustStrip() {
  const { lang } = useLang();
  const t = content[lang];

  return (
    <section className="relative py-8 sm:py-10">
      <Reveal className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-3 px-6 sm:gap-4">
        {t.items.map((item) => (
          <div
            key={item.label}
            className="border-card-border bg-card/60 text-foreground-muted flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium"
          >
            <item.icon size={15} className="text-primary shrink-0" />
            {item.label}
          </div>
        ))}
      </Reveal>
    </section>
  );
}
