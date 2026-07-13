import { Check, X } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { SectionBadge, SectionHeading } from "@/components/shared/SectionBadge";
import { useReveal, revealDirClass } from "@/lib/hooks/useReveal";

const content = {
  uz: {
    badge: "Muammo → Yechim",
    title: "Nima uchun Tzmliy?",
    problemTitle: "Eski usul",
    solutionTitle: "Tzmliy bilan",
    problems: [
      "Savdo va moliya ma'lumotlari turli Excel-fayllarda tarqoq",
      "CRM, qo'ng'iroqlar va hisoblar uchun 5-10 ta alohida dastur",
      "Real-time nazorat yo'q — hamma narsa kech ma'lum bo'ladi",
      "Integratsiyalar uchun qimmat va sekin rivojlanish",
      "Ma'lumotlar xavfsizligi va izolyatsiya ta'minlanmagan",
    ],
    solutions: [
      "Barcha ma'lumotlar bitta platformada — bir martalik kirish",
      "CRM, moliya, qo'ng'iroqlar va ledger yagona tizimda",
      "SSE orqali real-time dashboard — hamma narsa darhol ko'rinadi",
      "AmoCRM, Bitrix24, Telegram va boshqalar tayyor integratsiya",
      "PostgreSQL RLS — har bir tenant o'z ma'lumotlarida izolyatsiyalangan",
    ],
  },
  ru: {
    badge: "Проблема → Решение",
    title: "Почему Tzmliy?",
    problemTitle: "Старый подход",
    solutionTitle: "С Tzmliy",
    problems: [
      "Данные продаж и финансов разбросаны по разным Excel-файлам",
      "5-10 отдельных программ для CRM, звонков и счетов",
      "Нет контроля в реальном времени — всё выясняется поздно",
      "Дорогая и медленная разработка для интеграций",
      "Безопасность и изоляция данных не обеспечены",
    ],
    solutions: [
      "Все данные на одной платформе — единый вход",
      "CRM, финансы, звонки и леджер в единой системе",
      "Real-time дашборд через SSE — всё видно мгновенно",
      "AmoCRM, Bitrix24, Telegram и другие — готовые интеграции",
      "PostgreSQL RLS — каждый тенант изолирован в своих данных",
    ],
  },
};

export function ProblemSolution() {
  const { lang } = useLang();
  const c = content[lang];
  const { ref, visible } = useReveal<HTMLDivElement>();

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-20">
      <SectionHeading badge={<SectionBadge>{c.badge}</SectionBadge>} title={c.title} />

      <div ref={ref} className="grid grid-cols-1 gap-5 sm:gap-8 md:grid-cols-2">
        <div
          className={revealDirClass(
            visible,
            "left",
            "border-danger/20 bg-danger/5 rounded-2xl border p-5 sm:rounded-3xl sm:p-8",
          )}
        >
          <div className="mb-7 flex items-center gap-3">
            <div className="bg-danger/15 flex size-10 items-center justify-center rounded-xl">
              <X size={20} className="text-danger" />
            </div>
            <h3 className="font-heading text-xl font-bold text-foreground">{c.problemTitle}</h3>
          </div>
          {c.problems.map((p, i) => (
            <div
              key={i}
              className={`flex gap-3 py-3.5 ${i < c.problems.length - 1 ? "border-b border-danger/10" : ""}`}
            >
              <X size={16} className="text-danger mt-0.5 shrink-0" />
              <span className="text-[15px] leading-relaxed text-foreground-muted">{p}</span>
            </div>
          ))}
        </div>

        <div
          className={revealDirClass(
            visible,
            "right",
            "border-primary/20 bg-primary/5 rounded-2xl border p-5 sm:rounded-3xl sm:p-8",
          )}
          style={{ transitionDelay: "150ms" }}
        >
          <div className="mb-7 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/10">
              <Check size={20} className="text-primary" />
            </div>
            <h3 className="font-heading text-xl font-bold text-foreground">{c.solutionTitle}</h3>
          </div>
          {c.solutions.map((s, i) => (
            <div
              key={i}
              className={`flex gap-3 py-3.5 ${i < c.solutions.length - 1 ? "border-b border-primary/10" : ""}`}
            >
              <Check size={16} className="text-primary mt-0.5 shrink-0" />
              <span className="text-[15px] leading-relaxed text-foreground">{s}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
