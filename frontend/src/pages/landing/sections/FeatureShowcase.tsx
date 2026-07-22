import { Check, ArrowRight, Package, TrendingUp } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { Reveal } from "@/components/shared/Reveal";
import { useReveal } from "@/lib/hooks/useReveal";

// "Feature showcase" style section (reference: TeamWave/Framer template's
// layered-card mockup on one side, checklist + CTA on the other), rebuilt
// around a real Tizimly module (sales + warehouse) with two overlapping
// .glass-card mockups instead of the reference's single Kanban-task card,
// and Tizimly's own gold/blue palette instead of its pink/teal.
//
// The two mockup cards sit inside a bordered rectangular frame (per explicit
// feedback: "kartochkalar to'rtburchak ichiga o'ralgan holda bo'lishi
// kerak"). The second card starts stacked directly on the first and peels
// away into its offset position on scroll reveal ("asta ajralib tushishi"),
// via a plain CSS transition with a transition-delay so it visibly detaches
// after the first card has already settled -- no animation library.

const content = {
  uz: {
    badge: "Xususiyat",
    title1: "Savdo va ombor",
    titleHighlight: "bitta zanjirda",
    checklist: [
      "Mahsulot va ombor to'liq integratsiyalashgan",
      "Har bir savdo qoldiqni avtomatik yangilaydi",
      "To'lovlar, qarzdorlik va bekor qilishlar nazorati",
      "Tan narxi asosida real vaqtli foyda hisobi",
    ],
    cta: "Batafsil",
    saleCard: { label: "Yangi savdo", customer: "Alisher Karimov", amount: "12 400 000 so'm", status: "Faol" },
    stockCard: { label: "Mahsulot qoldig'i", product: "iPhone 15 Pro", qty: "24 dona", trend: "+8% shu hafta" },
  },
  ru: {
    badge: "Возможность",
    title1: "Продажи и склад",
    titleHighlight: "в одной цепочке",
    checklist: [
      "Товары и склад полностью интегрированы",
      "Каждая продажа автоматически обновляет остаток",
      "Контроль платежей, задолженностей и отмен",
      "Прибыль в реальном времени по себестоимости",
    ],
    cta: "Подробнее",
    saleCard: { label: "Новая продажа", customer: "Алишер Каримов", amount: "12 400 000 сум", status: "Активна" },
    stockCard: { label: "Остаток товара", product: "iPhone 15 Pro", qty: "24 шт.", trend: "+8% за неделю" },
  },
};

function LayeredCardsFrame({ t }: { t: (typeof content)["uz"] }) {
  const { ref, visible } = useReveal<HTMLDivElement>(0.3);

  return (
    <div
      ref={ref}
      className="border-card-border bg-card/40 relative h-[340px] overflow-hidden rounded-3xl border p-6 sm:h-[380px] sm:p-8"
    >
      <div className="glass-card absolute top-6 left-[6%] w-[64%] rounded-2xl p-6 sm:left-[10%] sm:w-[58%]">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-foreground-muted text-xs font-semibold tracking-wide uppercase">
            {t.saleCard.label}
          </span>
          <span className="bg-primary/15 text-primary rounded-full px-2.5 py-1 text-xs font-semibold">
            {t.saleCard.status}
          </span>
        </div>
        <p className="mb-1 text-lg font-bold">{t.saleCard.customer}</p>
        <p className="text-foreground-muted font-mono text-2xl font-bold" style={{ color: "var(--color-primary)" }}>
          {t.saleCard.amount}
        </p>
      </div>

      <div
        className="glass-card absolute right-6 bottom-6 w-[58%] rounded-2xl p-6 transition-all duration-700 ease-out sm:right-8 sm:bottom-8 sm:w-[54%]"
        style={{
          transitionDelay: visible ? "400ms" : "0ms",
          opacity: visible ? 1 : 0,
          transform: visible ? "translate(0, 0) scale(1)" : "translate(-28%, -55%) scale(0.94)",
        }}
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="bg-secondary/15 flex size-10 items-center justify-center rounded-xl">
            <Package size={18} style={{ color: "var(--color-secondary)" }} />
          </div>
          <span className="text-foreground-muted text-xs font-semibold tracking-wide uppercase">
            {t.stockCard.label}
          </span>
        </div>
        <p className="mb-1 text-lg font-bold">{t.stockCard.product}</p>
        <div className="flex items-center justify-between">
          <span className="font-mono text-xl font-bold">{t.stockCard.qty}</span>
          <span className="flex items-center gap-1 text-sm font-semibold" style={{ color: "var(--color-success)" }}>
            <TrendingUp size={14} />
            {t.stockCard.trend}
          </span>
        </div>
      </div>
    </div>
  );
}

export function FeatureShowcase() {
  const { lang } = useLang();
  const t = content[lang];

  return (
    <section className="relative overflow-hidden py-20 sm:py-28">
      <div
        className="landing-glow-drift pointer-events-none absolute top-1/4 left-[6%] size-[360px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(212,175,55,0.1) 0%, transparent 70%)" }}
      />

      <div className="relative mx-auto grid max-w-6xl gap-16 px-6 lg:grid-cols-2 lg:items-center lg:gap-12">
        <Reveal>
          <LayeredCardsFrame t={t} />
        </Reveal>

        <Reveal delay={120}>
          <div className="border-primary/25 bg-primary/10 mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5">
            <div className="bg-primary size-1.5 rounded-full" />
            <span className="text-primary text-[13px] font-semibold">{t.badge}</span>
          </div>

          <h2 className="font-display mb-7 text-[clamp(28px,4vw,42px)] leading-[1.15] font-bold tracking-tight">
            {t.title1} <span className="gold-gradient-text">{t.titleHighlight}</span>
          </h2>

          <ul className="mb-9 space-y-4">
            {t.checklist.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="bg-primary/15 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full">
                  <Check size={14} style={{ color: "var(--color-primary)" }} />
                </span>
                <span className="text-[15px] leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>

          <a
            href="#features"
            className="border-card-border hover:bg-accent inline-flex items-center gap-2 rounded-xl border px-6 py-3 text-sm font-semibold transition-colors"
          >
            {t.cta}
            <ArrowRight size={16} />
          </a>
        </Reveal>
      </div>
    </section>
  );
}
