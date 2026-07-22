import type { LucideIcon } from "lucide-react";
import { ShoppingCart, Users, Plug, BarChart3 } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { Reveal } from "@/components/shared/Reveal";

// "Key feature categories" style section (reference: TeamWave/Framer
// template's 2x2 icon-card grid), rebuilt with Tizimly's own modules and
// brand palette (gold/blue/green/orange accents rotated per card) instead
// of the reference's single pink accent, using the repo's existing
// Reveal/.glass-card primitives.

interface FeatureCard {
  icon: LucideIcon;
  color: string;
  title: string;
  desc: string;
}

const content: Record<"uz" | "ru", { badge: string; title: string; cards: FeatureCard[] }> = {
  uz: {
    badge: "Asosiy imkoniyatlar",
    title: "Bitta platforma, barcha jarayonlar",
    cards: [
      {
        icon: ShoppingCart,
        color: "var(--color-primary)",
        title: "Savdo va ombor",
        desc: "Mahsulotlar, zaxira va sotuvlarni bitta joyda boshqaring. Har bir savdo ombordagi qoldiqni avtomatik yangilaydi, tan narxi asosida foyda hisoblanadi.",
      },
      {
        icon: Users,
        color: "var(--color-secondary)",
        title: "CRM va qo'ng'iroqlar",
        desc: "Mijozlar bazasi, lidlar va qo'ng'iroq tarixi bir joyda. AmoCRM, Bitrix24 va UTEL integratsiyalari orqali jarayonlarni avtomatlashtiring.",
      },
      {
        icon: Plug,
        color: "var(--color-accent-orange)",
        title: "Integratsiyalar va avtomatlashtirish",
        desc: "Meta Ads, CRM va IP-telefoniya xizmatlari bilan ulanib, ma'lumotlarni qo'lda kiritishga vaqt sarflamang — hammasi real vaqt rejimida sinxronlanadi.",
      },
      {
        icon: BarChart3,
        color: "var(--color-success)",
        title: "Analitika va hisobotlar",
        desc: "Daromad, qarzdorlik va jamoa samaradorligini real vaqt rejimida kuzating. Kunlik, haftalik va oylik davrlar bo'yicha chuqur tahlil oling.",
      },
    ],
  },
  ru: {
    badge: "Основные возможности",
    title: "Одна платформа для всех процессов",
    cards: [
      {
        icon: ShoppingCart,
        color: "var(--color-primary)",
        title: "Продажи и склад",
        desc: "Управляйте товарами, остатками и продажами в одном месте. Каждая продажа автоматически обновляет склад, а прибыль считается по себестоимости.",
      },
      {
        icon: Users,
        color: "var(--color-secondary)",
        title: "CRM и звонки",
        desc: "База клиентов, лиды и история звонков в одном окне. Автоматизируйте процессы через интеграции с AmoCRM, Bitrix24 и UTEL.",
      },
      {
        icon: Plug,
        color: "var(--color-accent-orange)",
        title: "Интеграции и автоматизация",
        desc: "Подключите Meta Ads, CRM и IP-телефонию — данные синхронизируются в реальном времени, без ручного ввода.",
      },
      {
        icon: BarChart3,
        color: "var(--color-success)",
        title: "Аналитика и отчёты",
        desc: "Следите за доходом, задолженностью и эффективностью команды в реальном времени. Глубокая аналитика за день, неделю и месяц.",
      },
    ],
  },
};

export function FeaturesGrid() {
  const { lang } = useLang();
  const t = content[lang];

  return (
    <section id="features" className="relative overflow-hidden py-20 sm:py-28">
      <div
        className="landing-glow-drift pointer-events-none absolute top-1/3 right-[8%] size-[380px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(76,111,255,0.1) 0%, transparent 70%)" }}
      />

      <div className="relative mx-auto max-w-6xl px-6">
        <Reveal className="mx-auto mb-14 max-w-2xl text-center">
          <div className="border-primary/25 bg-primary/10 mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5">
            <div className="bg-primary size-1.5 rounded-full" />
            <span className="text-primary text-[13px] font-semibold">{t.badge}</span>
          </div>
          <h2 className="font-display text-[clamp(28px,4vw,42px)] leading-[1.15] font-bold tracking-tight">
            {t.title}
          </h2>
        </Reveal>

        <div className="grid gap-5 sm:grid-cols-2">
          {t.cards.map((card, i) => {
            const Icon = card.icon;
            return (
              <Reveal key={card.title} delay={i * 90}>
                <div className="glass-card card-hover-lift h-full p-8">
                  <div
                    className="mb-5 flex size-12 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `color-mix(in srgb, ${card.color} 14%, transparent)` }}
                  >
                    <Icon size={22} style={{ color: card.color }} />
                  </div>
                  <h3 className="mb-3 text-lg font-bold">{card.title}</h3>
                  <p className="text-foreground-muted text-[15px] leading-relaxed">{card.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
