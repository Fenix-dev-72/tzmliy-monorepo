import { AlertCircle, Database, Eye, Key, Lock, Shield } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { SectionBadge, SectionHeading } from "@/components/shared/SectionBadge";
import { useReveal, revealClass } from "@/lib/hooks/useReveal";

const content = {
  uz: {
    badge: "Xavfsizlik",
    title: "Enterprise darajasida xavfsizlik",
    subtitle: "Moliyaviy ma'lumotlaringiz eng yuqori xavfsizlik standartlari bilan himoyalangan.",
    items: [
      { icon: Database, title: "Row-Level Security", desc: "PostgreSQL RLS — har bir tenant faqat o'z ma'lumotlarini ko'radi. Hech qanday tenant boshqasining ma'lumotlariga kira olmaydi.", color: "#4C6FFF" },
      { icon: Key, title: "Ikki faktorli autentifikatsiya", desc: "2FA bilan barcha foydalanuvchi kirish nuqtalari himoyalangan. SMS va authenticator ilovasi qo'llab-quvvatlanadi.", color: "#D4AF37" },
      { icon: Eye, title: "Audit Log", desc: "Barcha amallar yozib boriladi — kim, qachon, nima qilganini to'liq tarix. Ma'lumotlar o'zgartirib bo'lmaydi.", color: "#2FBF71" },
      { icon: Lock, title: "Ma'lumotlar shifrlash", desc: "Tranzit va saqlashda to'liq shifrlash (TLS 1.3 + AES-256). Append-only ledger — hech qanday ma'lumot o'chirib bo'lmaydi.", color: "#D4AF37" },
      { icon: Shield, title: "RPO=0, RTO≤30 min", desc: "Sinxron standby server bilan real-time replikatsiya. Har qanday nosozlikda 30 daqiqa ichida to'liq tiklash.", color: "#4C6FFF" },
      { icon: AlertCircle, title: "Monitorinq va Xabarnomalar", desc: "24/7 monitoring, avtomatik xabarnomalar, anomaliya aniqlash va real-time incident boshqaruvi.", color: "#2FBF71" },
    ],
  },
  ru: {
    badge: "Безопасность",
    title: "Безопасность уровня Enterprise",
    subtitle: "Ваши финансовые данные защищены по высшим стандартам безопасности.",
    items: [
      { icon: Database, title: "Row-Level Security", desc: "PostgreSQL RLS — каждый тенант видит только свои данные. Ни один тенант не может получить доступ к данным другого.", color: "#4C6FFF" },
      { icon: Key, title: "Двухфакторная аутентификация", desc: "2FA защищает все точки входа пользователей. Поддерживаются SMS и приложение-аутентификатор.", color: "#D4AF37" },
      { icon: Eye, title: "Журнал аудита", desc: "Все действия записываются — полная история того, кто, когда и что сделал. Данные неизменяемы.", color: "#2FBF71" },
      { icon: Lock, title: "Шифрование данных", desc: "Полное шифрование в транзите и хранении (TLS 1.3 + AES-256). Append-only леджер — данные нельзя удалить.", color: "#D4AF37" },
      { icon: Shield, title: "RPO=0, RTO≤30 мин", desc: "Репликация в реальном времени с синхронным стендбай-сервером. Полное восстановление за 30 минут при любом сбое.", color: "#4C6FFF" },
      { icon: AlertCircle, title: "Мониторинг и Оповещения", desc: "Мониторинг 24/7, автоматические оповещения, обнаружение аномалий и управление инцидентами в реальном времени.", color: "#2FBF71" },
    ],
  },
};

export function SecuritySection() {
  const { lang } = useLang();
  const c = content[lang];
  const { ref, visible } = useReveal<HTMLDivElement>();

  return (
    <section className="from-secondary/[0.03] via-secondary/[0.03] bg-gradient-to-b to-transparent px-4 py-12 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          badge={
            <SectionBadge variant="blue" icon={<Shield size={14} />}>
              {c.badge}
            </SectionBadge>
          }
          title={c.title}
          subtitle={c.subtitle}
        />

        <div ref={ref} className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
          {c.items.map((item, i) => (
            <div
              key={i}
              className={revealClass(
                visible,
                "bg-card rounded-2xl border p-5 backdrop-blur-md hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.18)] hover:duration-300 sm:rounded-[18px] sm:p-7",
              )}
              style={{ borderColor: `${item.color}20`, transitionDelay: `${(i % 3) * 100}ms` }}
            >
              <div
                className="animate-icon-pulse mb-4.5 flex size-12 items-center justify-center rounded-2xl border"
                style={{ background: `${item.color}12`, borderColor: `${item.color}25`, animationDelay: `${i * 0.3}s` }}
              >
                <item.icon size={22} color={item.color} strokeWidth={1.5} />
              </div>
              <h3 className="font-heading mb-2.5 text-[17px] font-bold text-foreground">{item.title}</h3>
              <p className="text-sm leading-relaxed text-foreground-muted">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
