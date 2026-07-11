import { ArrowRight, BarChart3, DollarSign, Phone, Users } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { SectionBadge, SectionHeading } from "@/components/shared/SectionBadge";

const content = {
  uz: {
    badge: "Asosiy modullar",
    title: "Biznesingiz uchun hamma narsa",
    subtitle: "Har bir modul professional jamoalar uchun loyihalangan va bir-biri bilan muammosiz bog'liq.",
    more: "Batafsil",
    features: [
      {
        icon: Users,
        color: "#4C6FFF",
        title: "CRM va Mijozlar",
        desc: "Leadlar, mijozlar, muloqot tarixi va segmentatsiya. UTEL qo'ng'iroqlari bilan integratsiya, avtomatik follow-up va to'liq pipeline boshqaruvi.",
        tags: ["Lead boshqaruvi", "Qo'ng'iroq tarixi", "Pipeline", "Segmentatsiya"],
      },
      {
        icon: DollarSign,
        color: "#D4AF37",
        title: "Moliya va Ledger",
        desc: "Append-only ledger, qarz va refund workflow. To'liq audit trail, UZS/USD, Click va Payme integratsiyasi. Har bir tranzaksiya o'zgartirib bo'lmaydi.",
        tags: ["Append-only ledger", "Qarz/Refund", "Click & Payme", "Audit trail"],
      },
      {
        icon: Phone,
        color: "#2FBF71",
        title: "Qo'ng'iroqlar & Call-markaz",
        desc: "UTEL integratsiyasi, qo'ng'iroq yozuvlari, agent statistikasi va real-time monitoring. Mijozni tanib, tarixini darhol ko'rsatadi.",
        tags: ["UTEL integratsiya", "Yozuvlar", "Agent statistika", "Real-time"],
      },
      {
        icon: BarChart3,
        color: "#D4AF37",
        title: "Live Dashboard & Leaderboard",
        desc: "SSE orqali real-time yangilanuvchi dashboard. Sotuvchilar reytingi, moliyaviy KPI, qo'ng'iroq statistikasi — hamma narsa darhol ko'rinadi.",
        tags: ["SSE real-time", "Leaderboard", "KPI monitoring", "Export"],
      },
    ],
  },
  ru: {
    badge: "Основные модули",
    title: "Всё для вашего бизнеса",
    subtitle: "Каждый модуль разработан для профессиональных команд и бесшовно связан с другими.",
    more: "Подробнее",
    features: [
      {
        icon: Users,
        color: "#4C6FFF",
        title: "CRM и Клиенты",
        desc: "Лиды, клиенты, история коммуникаций и сегментация. Интеграция с UTEL-звонками, автоматический follow-up и полное управление пайплайном.",
        tags: ["Управление лидами", "История звонков", "Пайплайн", "Сегментация"],
      },
      {
        icon: DollarSign,
        color: "#D4AF37",
        title: "Финансы и Леджер",
        desc: "Append-only леджер, рабочий процесс долгов и возвратов. Полный audit trail, UZS/USD, интеграция Click и Payme.",
        tags: ["Append-only леджер", "Долги/Возвраты", "Click & Payme", "Audit trail"],
      },
      {
        icon: Phone,
        color: "#2FBF71",
        title: "Звонки & Колл-центр",
        desc: "Интеграция с UTEL, записи звонков, статистика агентов и мониторинг в реальном времени. Мгновенно показывает историю клиента.",
        tags: ["Интеграция UTEL", "Записи", "Статистика агентов", "Real-time"],
      },
      {
        icon: BarChart3,
        color: "#D4AF37",
        title: "Live Dashboard & Leaderboard",
        desc: "Дашборд с обновлением в реальном времени через SSE. Рейтинг продавцов, финансовые KPI, статистика звонков — всё мгновенно.",
        tags: ["SSE real-time", "Leaderboard", "KPI мониторинг", "Экспорт"],
      },
    ],
  },
};

export function FeaturesGrid() {
  const { lang } = useLang();
  const c = content[lang];

  return (
    <section id="features" className="bg-card/30 px-6 py-20">
      <div className="mx-auto max-w-7xl">
        <SectionHeading badge={<SectionBadge>{c.badge}</SectionBadge>} title={c.title} subtitle={c.subtitle} />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {c.features.map((feature, i) => (
            <div
              key={i}
              className="bg-card border-card-border group rounded-3xl border p-8 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-md transition-all hover:-translate-y-1.5"
            >
              <div className="mb-5 flex items-start gap-4">
                <div
                  className="flex size-13 shrink-0 items-center justify-center rounded-2xl border"
                  style={{ background: `${feature.color}15`, borderColor: `${feature.color}30` }}
                >
                  <feature.icon size={24} color={feature.color} strokeWidth={1.5} />
                </div>
                <h3 className="font-heading mt-2 text-xl font-bold text-foreground">{feature.title}</h3>
              </div>

              <p className="mb-5 text-[15px] leading-relaxed text-foreground-muted">{feature.desc}</p>

              <div className="mb-5 flex flex-wrap gap-2">
                {feature.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border px-3 py-1 text-xs font-semibold"
                    style={{ background: `${feature.color}10`, borderColor: `${feature.color}25`, color: feature.color }}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <button
                className="flex items-center gap-1.5 text-sm font-semibold"
                style={{ color: feature.color }}
              >
                {c.more}
                <ArrowRight size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
