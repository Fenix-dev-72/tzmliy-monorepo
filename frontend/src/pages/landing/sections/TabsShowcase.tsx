import { useState } from "react";
import { Check, Clock, ShieldCheck, Smartphone, Eye, Pencil, Signal, Wifi, BatteryFull, Bell, Search } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { Reveal } from "@/components/shared/Reveal";
import { TizimlyLogo } from "@/components/layout/TizimlyLogo";

// "Time Tracking / User Permissions / Mobile Accessibility" tabbed feature
// section (reference: TeamWave/Framer template's pill-tab-switcher block --
// three tabs with an underline indicator, each swapping in its own
// headline+checklist+CTA on the left and its own mockup on the right).
// Rebuilt around three real Tizimly modules -- Attendance (check-in/
// check-out, backend: attendance module), RBAC (roles/permissions, backend:
// auth/roles_service), and the responsive web frontend itself (there is no
// native iOS/Android app -- see frontend/CLAUDE.md's tech stack, so this tab
// is framed as "responsive on every device", not app-store mockups) --
// instead of the reference's generic project-management feature set.

type TabKey = "attendance" | "security" | "mobile";

const content = {
  uz: {
    badge: "Imkoniyatlar",
    tabs: {
      attendance: "Davomat",
      security: "Xavfsizlik",
      mobile: "Mobil qulaylik",
    },
    attendance: {
      title1: "Davomat va",
      titleHighlight: "hisobot",
      checklist: [
        "Har bir xodim uchun kelish/ketish vaqtini nazorat qilish",
        "Kechikish va erta ketishlar avtomatik hisoblanadi",
        "Kunlik, haftalik davomat tarixi bitta joyda",
        "Excel/CSV formatida eksport",
      ],
      cta: "Batafsil",
      cardTitle: "Davomat",
      date: "Bugun, 30 Noy",
      columns: { name: "XODIM", in: "KELDI", out: "KETDI", status: "HOLAT" },
      rows: [
        { name: "Elena Andres", in: "09:02", out: "18:05", status: "Yakunlandi", statusColor: "var(--color-success)" },
        { name: "Mark J. Berg", in: "09:15", out: "—", status: "Ishda", statusColor: "var(--color-secondary)" },
        { name: "Tina Dobos", in: "08:58", out: "17:40", status: "Yakunlandi", statusColor: "var(--color-success)" },
        { name: "Jack Dean", in: "—", out: "—", status: "Kelmagan", statusColor: "var(--color-accent-orange)" },
      ],
    },
    security: {
      title1: "Xavfsizlik va",
      titleHighlight: "ruxsatlar",
      checklist: [
        "Ma'lumotlar shifrlangan holda saqlanadi",
        "Rol asosidagi kirish nazorati (RBAC)",
        "Har bir rol uchun moslashtiriladigan ruxsatlar",
        "Muhim amallar uchun ikki bosqichli autentifikatsiya (2FA)",
      ],
      cta: "Batafsil",
      columns: { user: "FOYDALANUVCHI", roles: "ROLLAR", options: "" },
      rows: [
        { name: "Alisher Karimov", roles: ["Admin"] },
        { name: "Nodira Yusupova", roles: ["Menejer"] },
        { name: "Bekzod Rashidov", roles: ["Moliyachi"] },
        { name: "Madina Tosheva", roles: ["Agent"] },
      ],
    },
    mobile: {
      title1: "Mobil",
      titleHighlight: "qulaylik",
      checklist: [
        "Har qanday qurilmada moslashuvchan (responsive) dizayn",
        "Planshet va telefonlarda to'liq funksional interfeys",
        "Yengil va tezkor yuklanish",
        "Bir xil funksionallik barcha ekran o'lchamlarida",
      ],
      cta: "Batafsil",
      statLabel: "Faol savdolar",
      statSub: "Shu oy",
    },
  },
  ru: {
    badge: "Возможности",
    tabs: {
      attendance: "Учёт времени",
      security: "Безопасность",
      mobile: "Мобильность",
    },
    attendance: {
      title1: "Учёт времени и",
      titleHighlight: "отчётность",
      checklist: [
        "Контроль прихода/ухода каждого сотрудника",
        "Опоздания и ранние уходы считаются автоматически",
        "История посещаемости в одном месте",
        "Экспорт в Excel/CSV",
      ],
      cta: "Подробнее",
      cardTitle: "Посещаемость",
      date: "Сегодня, 30 ноя",
      columns: { name: "СОТРУДНИК", in: "ПРИШЁЛ", out: "УШЁЛ", status: "СТАТУС" },
      rows: [
        { name: "Елена Андрес", in: "09:02", out: "18:05", status: "Завершено", statusColor: "var(--color-success)" },
        { name: "Марк Й. Берг", in: "09:15", out: "—", status: "На месте", statusColor: "var(--color-secondary)" },
        { name: "Тина Добос", in: "08:58", out: "17:40", status: "Завершено", statusColor: "var(--color-success)" },
        { name: "Джек Дин", in: "—", out: "—", status: "Не пришёл", statusColor: "var(--color-accent-orange)" },
      ],
    },
    security: {
      title1: "Безопасность и",
      titleHighlight: "права доступа",
      checklist: [
        "Данные хранятся в зашифрованном виде",
        "Ролевой контроль доступа (RBAC)",
        "Настраиваемые права для каждой роли",
        "Двухфакторная аутентификация для важных действий",
      ],
      cta: "Подробнее",
      columns: { user: "ПОЛЬЗОВАТЕЛЬ", roles: "РОЛИ", options: "" },
      rows: [
        { name: "Алишер Каримов", roles: ["Админ"] },
        { name: "Нодира Юсупова", roles: ["Менеджер"] },
        { name: "Бекзод Рашидов", roles: ["Финансист"] },
        { name: "Мадина Тошева", roles: ["Агент"] },
      ],
    },
    mobile: {
      title1: "Мобильное",
      titleHighlight: "удобство",
      checklist: [
        "Адаптивный дизайн под любое устройство",
        "Полнофункциональный интерфейс на планшетах и телефонах",
        "Лёгкая и быстрая загрузка",
        "Одинаковый функционал на всех экранах",
      ],
      cta: "Подробнее",
      statLabel: "Активные продажи",
      statSub: "Этот месяц",
    },
  },
};

const TAB_KEYS: TabKey[] = ["attendance", "security", "mobile"];
const TAB_ICONS = { attendance: Clock, security: ShieldCheck, mobile: Smartphone };

function AttendanceMockup({ t }: { t: (typeof content)["uz"]["attendance"] }) {
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold">{t.cardTitle}</h3>
        <span className="border-card-border text-foreground-muted rounded-full border px-3 py-1 text-xs font-medium">
          {t.date}
        </span>
      </div>
      <div className="text-foreground-muted mb-2 grid grid-cols-4 text-[10px] font-semibold tracking-wide uppercase">
        <span>{t.columns.name}</span>
        <span>{t.columns.in}</span>
        <span>{t.columns.out}</span>
        <span className="text-right">{t.columns.status}</span>
      </div>
      <div className="divide-card-border/60 divide-y">
        {t.rows.map((row) => (
          <div key={row.name} className="grid grid-cols-4 items-center py-3 text-sm">
            <span className="truncate font-medium">{row.name}</span>
            <span className="text-foreground-muted font-mono text-xs">{row.in}</span>
            <span className="text-foreground-muted font-mono text-xs">{row.out}</span>
            <span className="justify-self-end text-xs font-semibold" style={{ color: row.statusColor }}>
              {row.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SecurityMockup({ t }: { t: (typeof content)["uz"]["security"] }) {
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="text-foreground-muted mb-3 grid grid-cols-[1fr_auto_auto] gap-4 text-[10px] font-semibold tracking-wide uppercase">
        <span>{t.columns.user}</span>
        <span>{t.columns.roles}</span>
        <span className="w-14" />
      </div>
      <div className="divide-card-border/60 divide-y">
        {t.rows.map((row) => (
          <div key={row.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-3 text-sm">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="bg-secondary/15 text-secondary flex size-8 items-center justify-center rounded-full text-[11px] font-bold">
                {row.name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)}
              </div>
              <span className="truncate font-medium">{row.name}</span>
            </div>
            <div className="flex gap-1.5">
              {row.roles.map((r) => (
                <span key={r} className="border-card-border bg-background/40 rounded-full border px-2.5 py-1 text-[11px] font-medium">
                  {r}
                </span>
              ))}
            </div>
            <div className="text-foreground-muted flex items-center gap-3">
              <Eye size={15} />
              <Pencil size={15} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileMockup({ t }: { t: (typeof content)["uz"]["mobile"] }) {
  const bars = [40, 65, 50, 80, 60, 90, 100];
  return (
    <div className="mx-auto w-[220px]">
      <div className="border-card-border bg-card rounded-[2rem] border p-2 shadow-sm">
        <div className="bg-background overflow-hidden rounded-[1.5rem]">
          <div className="text-foreground-muted flex items-center justify-between px-4 pt-3 text-[10px] font-semibold">
            <span>9:41</span>
            <div className="flex items-center gap-1">
              <Signal size={11} />
              <Wifi size={11} />
              <BatteryFull size={13} />
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <TizimlyLogo size={18} gradientId="mobileMockupLogoGrad" />
            <div className="text-foreground-muted flex items-center gap-2.5">
              <Search size={14} />
              <Bell size={14} />
              <div className="bg-secondary/30 size-5 rounded-full" />
            </div>
          </div>
          <div className="glass-card mx-3 mb-3 rounded-xl p-4">
            <p className="text-foreground-muted text-[11px]">{t.statLabel}</p>
            <p className="mb-2 text-2xl font-bold" style={{ color: "var(--color-primary)" }}>
              247
            </p>
            <div className="flex h-12 items-end gap-1">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm"
                  style={{ height: `${h}%`, backgroundColor: i === bars.length - 1 ? "var(--color-primary)" : "var(--color-primary)", opacity: i === bars.length - 1 ? 1 : 0.25 }}
                />
              ))}
            </div>
            <p className="text-foreground-muted mt-2 text-[10px]">{t.statSub}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TabsShowcase() {
  const { lang } = useLang();
  const t = content[lang];
  const [active, setActive] = useState<TabKey>("attendance");

  return (
    <section className="relative overflow-hidden py-20 sm:py-28">
      <div className="relative mx-auto max-w-6xl px-6">
        <Reveal className="mx-auto mb-10 max-w-2xl text-center">
          <div className="border-primary/25 bg-primary/10 mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5">
            <div className="bg-primary size-1.5 rounded-full" />
            <span className="text-primary text-[13px] font-semibold">{t.badge}</span>
          </div>
        </Reveal>

        <Reveal delay={80} className="relative mb-8">
          <div className="border-card-border flex justify-center gap-2 border-b sm:gap-8">
            {TAB_KEYS.map((key) => {
              const Icon = TAB_ICONS[key];
              const isActive = key === active;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActive(key)}
                  className={`flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition-colors sm:px-4 sm:text-base ${
                    isActive ? "border-primary text-foreground" : "text-foreground-muted border-transparent hover:text-foreground"
                  }`}
                >
                  <Icon size={16} />
                  {t.tabs[key]}
                </button>
              );
            })}
          </div>
        </Reveal>

        <Reveal delay={140}>
          <div className="border-card-border bg-card/40 grid gap-10 rounded-3xl border p-6 sm:p-10 lg:grid-cols-2 lg:items-center">
            {active === "attendance" && (
              <>
                <div>
                  <h2 className="font-display mb-6 text-[clamp(28px,4vw,42px)] leading-[1.15] font-bold tracking-tight">
                    {t.attendance.title1} <span className="gold-gradient-text">{t.attendance.titleHighlight}</span>
                  </h2>
                  <ul className="mb-8 space-y-4">
                    {t.attendance.checklist.map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <span className="bg-primary/15 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full">
                          <Check size={14} style={{ color: "var(--color-primary)" }} />
                        </span>
                        <span className="text-[15px] leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                  <a href="#features" className="gold-gradient-bg rounded-xl px-6 py-3 text-sm font-bold text-[#0A0E1A]">
                    {t.attendance.cta}
                  </a>
                </div>
                <AttendanceMockup t={t.attendance} />
              </>
            )}

            {active === "security" && (
              <>
                <div>
                  <h2 className="font-display mb-6 text-[clamp(28px,4vw,42px)] leading-[1.15] font-bold tracking-tight">
                    {t.security.title1} <span className="gold-gradient-text">{t.security.titleHighlight}</span>
                  </h2>
                  <ul className="mb-8 space-y-4">
                    {t.security.checklist.map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <span className="bg-primary/15 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full">
                          <Check size={14} style={{ color: "var(--color-primary)" }} />
                        </span>
                        <span className="text-[15px] leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                  <a href="#features" className="gold-gradient-bg rounded-xl px-6 py-3 text-sm font-bold text-[#0A0E1A]">
                    {t.security.cta}
                  </a>
                </div>
                <SecurityMockup t={t.security} />
              </>
            )}

            {active === "mobile" && (
              <>
                <div>
                  <h2 className="font-display mb-6 text-[clamp(28px,4vw,42px)] leading-[1.15] font-bold tracking-tight">
                    {t.mobile.title1} <span className="gold-gradient-text">{t.mobile.titleHighlight}</span>
                  </h2>
                  <ul className="mb-8 space-y-4">
                    {t.mobile.checklist.map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <span className="bg-primary/15 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full">
                          <Check size={14} style={{ color: "var(--color-primary)" }} />
                        </span>
                        <span className="text-[15px] leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                  <a href="#features" className="gold-gradient-bg rounded-xl px-6 py-3 text-sm font-bold text-[#0A0E1A]">
                    {t.mobile.cta}
                  </a>
                </div>
                <MobileMockup t={t.mobile} />
              </>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
