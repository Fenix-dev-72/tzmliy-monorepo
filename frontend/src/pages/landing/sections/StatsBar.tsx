import { useEffect, useRef, useState } from "react";
import { Building2, Users, Shield, Clock } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useReveal, revealClass } from "@/lib/hooks/useReveal";

function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const started = useRef(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          let frame = 0;
          const total = 60;
          const timer = setInterval(() => {
            frame++;
            setVal(Math.round((to / total) * frame));
            if (frame >= total) clearInterval(timer);
          }, 30);
        }
      },
      { threshold: 0.5 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [to]);

  return (
    <span ref={ref} className="font-mono">
      {val.toLocaleString()}
      {suffix}
    </span>
  );
}

export function StatsBar() {
  const { lang } = useLang();
  const { ref, visible } = useReveal<HTMLDivElement>();

  const stats =
    lang === "uz"
      ? [
          { icon: Building2, label: "Tenant", value: 200, suffix: "+", color: "#D4AF37" },
          { icon: Users, label: "Foydalanuvchi", value: 10000, suffix: "+", color: "#4C6FFF" },
          { icon: Shield, label: "Uptime", value: 99.9, suffix: "%", color: "#2FBF71", isFloat: true },
          { icon: Clock, label: "RPO", value: 0, suffix: "", extra: "=0 / RTO ≤30 min", color: "#D4AF37" },
        ]
      : [
          { icon: Building2, label: "Тенантов", value: 200, suffix: "+", color: "#D4AF37" },
          { icon: Users, label: "Пользователей", value: 10000, suffix: "+", color: "#4C6FFF" },
          { icon: Shield, label: "Аптайм", value: 99.9, suffix: "%", color: "#2FBF71", isFloat: true },
          { icon: Clock, label: "RPO", value: 0, suffix: "", extra: "=0 / RTO ≤30 мин", color: "#D4AF37" },
        ];

  return (
    <section ref={ref} className="mt-[-20px] mb-12 px-4 sm:mb-20 sm:px-6">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <div
            key={i}
            className={revealClass(
              visible,
              "bg-card/70 border-card-border flex items-center gap-3 rounded-xl border p-3 shadow-[0_8px_32px_rgba(0,0,0,0.15)] backdrop-blur-md hover:-translate-y-1.5 hover:shadow-[0_16px_40px_rgba(0,0,0,0.25)] hover:duration-300 sm:gap-4 sm:rounded-2xl sm:p-5 md:p-6",
            )}
            style={{ transitionDelay: `${i * 80}ms` }}
          >
            <div
              className="animate-icon-pulse flex size-10 shrink-0 items-center justify-center rounded-xl border sm:size-12 sm:rounded-2xl"
              style={{ background: `${stat.color}15`, borderColor: `${stat.color}30`, color: stat.color }}
            >
              <stat.icon size={18} color={stat.color} className="sm:hidden" />
              <stat.icon size={22} color={stat.color} className="hidden sm:block" />
            </div>
            <div>
              <div className="mb-0.5 text-lg font-bold text-foreground sm:mb-1 sm:text-2xl">
                {stat.isFloat ? (
                  <span className="font-mono">
                    99.9{stat.suffix}
                  </span>
                ) : stat.extra ? (
                  <span className="font-mono text-sm sm:text-xl">{stat.extra}</span>
                ) : (
                  <CountUp to={stat.value} suffix={stat.suffix} />
                )}
              </div>
              <div className="text-[11px] font-medium text-foreground-muted sm:text-[13px]">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
