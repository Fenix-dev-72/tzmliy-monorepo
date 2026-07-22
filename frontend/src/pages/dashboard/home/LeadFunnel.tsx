import { ArrowRight, CheckCircle2, Percent, Sparkles, ThumbsDown, UserPlus, XCircle, Zap } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import type { LeadQualitySummary } from "@/lib/api/analytics";

const content = {
  uz: {
    title: "Lidlar (barcha sotuvchilar)",
    seeAll: "Barchasini ko'rish",
    received: "Qabul qilindi",
    active: "Faol",
    won: "Yutildi",
    lost: "Yo'qotildi",
    quality: "Sifatli",
    lowQuality: "Sifatsiz",
    conversion: "Konversiya",
  },
  ru: {
    title: "Лиды (все продавцы)",
    seeAll: "Показать все",
    received: "Получено",
    active: "Активные",
    won: "Выиграно",
    lost: "Потеряно",
    quality: "Качественные",
    lowQuality: "Некачественные",
    conversion: "Конверсия",
  },
};

function FunnelStage({
  icon: Icon,
  color,
  value,
  label,
}: {
  icon: typeof UserPlus;
  color: string;
  value: number | string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ background: `${color}15` }}>
        <Icon size={18} color={color} strokeWidth={2} />
      </div>
      <div className="flex flex-col">
        <span className="font-mono text-lg leading-tight font-bold text-foreground">{value}</span>
        <span className="text-xs whitespace-nowrap text-foreground-muted">{label}</span>
      </div>
    </div>
  );
}

export function LeadFunnel({ leadQuality }: { leadQuality: LeadQualitySummary }) {
  const { lang } = useLang();
  const t = content[lang];

  const stages: { icon: typeof UserPlus; color: string; value: number; label: string }[] = [
    { icon: UserPlus, color: "#9333EA", value: leadQuality.received_count, label: t.received },
    { icon: Zap, color: "#2563EB", value: leadQuality.active_count, label: t.active },
    { icon: CheckCircle2, color: "#10B981", value: leadQuality.won_count, label: t.won },
    { icon: XCircle, color: "#EF4444", value: leadQuality.lost_count, label: t.lost },
    { icon: Sparkles, color: "#10B981", value: leadQuality.quality_count, label: t.quality },
    { icon: ThumbsDown, color: "#F59E0B", value: leadQuality.low_quality_count, label: t.lowQuality },
  ];

  return (
    <div className="glass-card card-hover-lift auth-card-enter mb-5 p-5 sm:mb-6 sm:p-6">
      <h3 className="mb-4 text-sm font-semibold text-foreground">{t.title}</h3>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-4 overflow-x-auto">
        {stages.map((s) => (
          <div key={s.label} className="flex items-center gap-4">
            <FunnelStage icon={s.icon} color={s.color} value={s.value} label={s.label} />
            <ArrowRight size={14} className="text-foreground-muted/50 shrink-0" />
          </div>
        ))}
        <div className="bg-primary/10 flex items-center gap-2.5 rounded-xl px-3 py-1.5">
          <div className="bg-primary/15 flex size-10 shrink-0 items-center justify-center rounded-full">
            <Percent size={18} className="text-primary" strokeWidth={2} />
          </div>
          <div className="flex flex-col">
            <span className="text-primary font-mono text-lg leading-tight font-bold">
              {leadQuality.conversion_pct === null ? "—" : `${leadQuality.conversion_pct}%`}
            </span>
            <span className="text-primary/80 text-xs whitespace-nowrap">{t.conversion}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
