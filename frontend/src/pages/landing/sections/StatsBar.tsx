import { useEffect, useRef, useState } from "react";
import { Building2, Users, Shield, Clock } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";

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
    <section className="mt-[-20px] mb-20 px-6">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <div
            key={i}
            className="bg-card/70 border-card-border flex items-center gap-4 rounded-2xl border p-6 shadow-[0_8px_32px_rgba(0,0,0,0.15)] backdrop-blur-md transition-transform hover:-translate-y-1"
          >
            <div
              className="flex size-12 shrink-0 items-center justify-center rounded-2xl border"
              style={{ background: `${stat.color}15`, borderColor: `${stat.color}30` }}
            >
              <stat.icon size={22} color={stat.color} />
            </div>
            <div>
              <div className="mb-1 text-2xl font-bold text-foreground">
                {stat.isFloat ? (
                  <span className="font-mono">
                    99.9{stat.suffix}
                  </span>
                ) : stat.extra ? (
                  <span className="font-mono text-xl">{stat.extra}</span>
                ) : (
                  <CountUp to={stat.value} suffix={stat.suffix} />
                )}
              </div>
              <div className="text-[13px] font-medium text-foreground-muted">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
