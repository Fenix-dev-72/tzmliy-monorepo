import { useLang } from "@/lib/i18n/LangContext";
import { TzmliyLogo, TzmliyWordmark } from "@/components/layout/TzmliyLogo";

const content = {
  uz: {
    tagline: "Biznesingizni bitta tizimda boshqaring",
    desc: "Enterprise B2B SaaS — savdo, moliya, CRM va qo'ng'iroqlar.",
    stats: ["200+ tenant", "99.9% uptime", "10 000+ foydalanuvchi"],
  },
  ru: {
    tagline: "Управляйте бизнесом в единой системе",
    desc: "Enterprise B2B SaaS — продажи, финансы, CRM и звонки.",
    stats: ["200+ тенантов", "99.9% аптайм", "10 000+ пользователей"],
  },
};

export function BrandPanel() {
  const { lang } = useLang();
  const t = content[lang];

  return (
    <div
      className="relative flex h-full min-h-screen w-full flex-col overflow-hidden p-12"
      style={{ background: "linear-gradient(145deg, #0A0E1A 0%, #0D1530 60%, #0A0E1A 100%)" }}
    >
      <div
        className="pointer-events-none absolute top-[10%] left-[-10%] size-[300px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(212,175,55,0.1) 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute bottom-[15%] right-[-10%] size-[250px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(76,111,255,0.08) 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(42,51,72,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(42,51,72,0.15) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative mb-auto flex items-center gap-2.5">
        <TzmliyLogo gradientId="brandPanelGoldGrad" />
        <TzmliyWordmark className="text-xl text-[#F5F6FA]" />
      </div>

      <div className="relative flex flex-1 flex-col justify-center">
        <div className="border-card-border mb-9 rounded-2xl border bg-[rgba(17,24,40,0.7)] p-5 backdrop-blur-md">
          <div className="mb-4 flex justify-between">
            {(
              [
                ["#D4AF37", "847M", "UZS"],
                ["#4C6FFF", "2,847", lang === "uz" ? "Mijoz" : "Клиенты"],
                ["#2FBF71", "99.9%", "Uptime"],
              ] as const
            ).map(([color, val, lbl]) => (
              <div key={lbl} className="text-center">
                <div className="font-mono mb-0.5 text-lg font-bold" style={{ color }}>
                  {val}
                </div>
                <div className="text-[11px] text-[#8A93A8]">{lbl}</div>
              </div>
            ))}
          </div>
          <div className="flex h-10 items-end gap-1">
            {[35, 55, 40, 70, 50, 80, 60, 90, 65, 100, 75, 85].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t"
                style={{
                  height: `${h}%`,
                  background: i === 11 ? "linear-gradient(180deg, #E8C874, #D4AF37)" : "rgba(212,175,55,0.2)",
                }}
              />
            ))}
          </div>
        </div>

        <h2 className="font-heading mb-4 text-[28px] leading-[1.3] font-extrabold tracking-tight text-[#F5F6FA]">
          {t.tagline}
        </h2>
        <p className="mb-8 text-sm leading-relaxed text-[#8A93A8]">{t.desc}</p>

        <div className="flex gap-3">
          {t.stats.map((stat) => (
            <div
              key={stat}
              className="flex-1 rounded-[10px] border border-[rgba(212,175,55,0.15)] bg-[rgba(212,175,55,0.07)] px-3 py-2.5 text-center"
            >
              <span className="text-xs font-semibold text-[#D4AF37]">{stat}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
