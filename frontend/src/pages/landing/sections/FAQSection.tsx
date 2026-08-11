import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { Reveal } from "@/components/shared/Reveal";
import { cn } from "@/components/ui/utils";

// Standard post-pricing FAQ section, reducing pre-purchase hesitation --
// hand-rolled open/closed state (no @radix-ui/react-accordion -- not
// installed, and frontend/CLAUDE.md's "deliberately not installed" list
// covers exactly this: don't add a primitive when plain useState works).

interface FaqItem {
  q: string;
  a: string;
}

const content = {
  uz: {
    badge: "Savol-javob",
    title: "Ko'p so'raladigan savollar",
    items: [
      {
        q: "Sinov muddati qancha davom etadi va karta talab qilinadimi?",
        a: "15 kunlik bepul sinov muddati mavjud, hech qanday to'lov kartasi so'ralmaydi. Sinov tugagach, istalgan tarifni tanlab davom etishingiz mumkin.",
      },
      {
        q: "Ma'lumotlarim xavfsizmi?",
        a: "Har bir kompaniyaning ma'lumotlari (RLS) orqali bir-biridan to'liq izolyatsiya qilingan, boshqa tenant hech qachon sizning ma'lumotlaringizni ko'ra olmaydi. Maxfiy ma'lumotlar (integratsiya kalitlari va h.k.) shifrlangan holda saqlanadi.",
      },
      {
        q: "Qaysi integratsiyalar mavjud?",
        a: "AmoCRM, Bitrix24, Meta Ads, UTEL va Moi Zvonki qo'ng'iroq provayderlari, Telegram bildirishnomalari, Click va Payme to'lov tizimlari — barchasi tizimda tayyor.",
      },
      {
        q: "Tarifni keyinroq o'zgartirish mumkinmi?",
        a: "Ha, istalgan vaqtda tarifni yuqoriroq yoki pastroqqa almashtirishingiz mumkin — Platform Admin bilan bog'lanish orqali.",
      },
      {
        q: "Muammo yuzaga kelsa, qo'llab-quvvatlash bormi?",
        a: "Ha, tizim ichidagi \"Yordam so'rash\" bo'limi orqali to'g'ridan-to'g'ri murojaat qilishingiz mumkin, javob tez orada beriladi.",
      },
      {
        q: "Obunani bekor qilish shartlari qanday?",
        a: "Obunani istalgan vaqtda bekor qilishingiz mumkin, majburiy uzoq muddatli shartnoma yo'q.",
      },
    ] as FaqItem[],
  },
  ru: {
    badge: "Вопросы и ответы",
    title: "Часто задаваемые вопросы",
    items: [
      {
        q: "Сколько длится пробный период и нужна ли карта?",
        a: "Доступен 15-дневный бесплатный пробный период, банковская карта не требуется. По окончании вы можете выбрать любой тариф и продолжить.",
      },
      {
        q: "Безопасны ли мои данные?",
        a: "Данные каждой компании полностью изолированы друг от друга (RLS) — другой тенант никогда не увидит ваши данные. Конфиденциальные данные (ключи интеграций и т.д.) хранятся в зашифрованном виде.",
      },
      {
        q: "Какие интеграции доступны?",
        a: "AmoCRM, Bitrix24, Meta Ads, провайдеры звонков UTEL и Мои звонки, уведомления в Telegram, платёжные системы Click и Payme — всё уже готово в системе.",
      },
      {
        q: "Можно ли поменять тариф позже?",
        a: "Да, вы можете перейти на более высокий или низкий тариф в любое время — обратившись к Platform Admin.",
      },
      {
        q: "Есть ли поддержка при возникновении проблем?",
        a: "Да, вы можете обратиться напрямую через раздел \"Обратиться за помощью\" внутри системы, ответ приходит быстро.",
      },
      {
        q: "Каковы условия отмены подписки?",
        a: "Вы можете отменить подписку в любое время, никакого обязательного долгосрочного договора нет.",
      },
    ] as FaqItem[],
  },
};

export function FAQSection() {
  const { lang } = useLang();
  const t = content[lang];
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="relative py-20 sm:py-28">
      <div className="relative mx-auto max-w-3xl px-6">
        <Reveal className="mx-auto mb-10 max-w-2xl text-center">
          <div className="border-primary/25 bg-primary/10 mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5">
            <div className="bg-primary size-1.5 rounded-full" />
            <span className="text-primary text-[13px] font-semibold">{t.badge}</span>
          </div>
          <h2 className="font-display text-[clamp(28px,4.2vw,44px)] leading-[1.15] font-bold tracking-tight">{t.title}</h2>
        </Reveal>

        <Reveal delay={80} className="border-card-border divide-card-border overflow-hidden divide-y rounded-2xl border">
          {t.items.map((item, i) => {
            const open = openIndex === i;
            return (
              <div key={item.q} className="bg-card/60">
                <button
                  type="button"
                  onClick={() => setOpenIndex(open ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  aria-expanded={open}
                >
                  <span className="text-[15px] font-semibold text-foreground">{item.q}</span>
                  <ChevronDown
                    size={18}
                    className={cn("text-foreground-muted shrink-0 transition-transform duration-200", open && "rotate-180")}
                  />
                </button>
                <div
                  className={cn(
                    "grid transition-[grid-template-rows] duration-200 ease-out",
                    open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="text-foreground-muted px-5 pb-4 text-sm leading-relaxed">{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}
