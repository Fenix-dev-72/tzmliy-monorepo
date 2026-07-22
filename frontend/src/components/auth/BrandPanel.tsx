import { useLocation } from "react-router";
import { useLang } from "@/lib/i18n/LangContext";
import { DashboardMockup } from "@/components/shared/DashboardMockup";

const content = {
  uz: {
    login: {
      title: ["Tizimga kiring va biznesingizni ", "avtomatlashtiring."],
      desc: "Hisobingizga kiring va barcha imkoniyatlardan foydalanishni davom eting.",
    },
    register: {
      title: ["Hisob yarating va ", "Tizimly", " bilan boshlang."],
      desc: "Yangi hisob yarating va AI yordamida biznesingizni yangi bosqichga olib chiqing.",
    },
  },
  ru: {
    login: {
      title: ["Войдите в систему и ", "автоматизируйте", " бизнес."],
      desc: "Войдите в аккаунт и продолжайте пользоваться всеми возможностями.",
    },
    register: {
      title: ["Создайте аккаунт с ", "Tizimly", " и начните расти."],
      desc: "Создайте новый аккаунт и выведите бизнес на новый уровень с помощью AI.",
    },
  },
};

export function BrandPanel() {
  const { lang } = useLang();
  const location = useLocation();
  const variant = location.pathname.startsWith("/register") ? "register" : "login";
  const t = content[lang][variant];

  return (
    <div className="bg-background relative flex h-full w-full flex-col overflow-hidden px-6 py-8 sm:px-10 sm:py-10 lg:min-h-screen lg:justify-center lg:px-12">
      <div className="relative flex flex-1 flex-col justify-center lg:flex-none">
        <h2 className="font-heading text-foreground mb-3 text-center text-[22px] leading-[1.3] font-extrabold tracking-tight sm:text-[26px] lg:text-left lg:text-[28px]">
          {t.title.map((part, i) => (
            <span key={i} className={i === 1 ? "gold-gradient-text" : ""}>
              {part}
            </span>
          ))}
        </h2>
        <p className="text-foreground-muted mb-8 text-center text-sm leading-relaxed lg:text-left">{t.desc}</p>

        <DashboardMockup />
      </div>
    </div>
  );
}
