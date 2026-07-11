import { useLang } from "@/lib/i18n/LangContext";

const labels = {
  uz: ["Zaif", "O'rtacha", "Yaxshi", "Kuchli"],
  ru: ["Слабый", "Средний", "Хороший", "Сильный"],
};

const colors = ["transparent", "#E5484D", "#F5A623", "#4C6FFF", "#2FBF71"];

function scoreOf(password: string) {
  if (password.length === 0) return 0;
  if (password.length < 6) return 1;
  if (password.length < 10) return 2;
  return /[A-Z]/.test(password) && /\d/.test(password) ? 4 : 3;
}

export function PasswordStrengthMeter({ password }: { password: string }) {
  const { lang } = useLang();
  const score = scoreOf(password);
  if (score === 0) return null;
  const label = labels[lang][score - 1];

  return (
    <div className="mt-2">
      <div className="mb-1 flex gap-1">
        {[1, 2, 3, 4].map((lvl) => (
          <div
            key={lvl}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{ background: score >= lvl ? colors[score] : "var(--card-border)" }}
          />
        ))}
      </div>
      <span className="text-xs font-semibold" style={{ color: colors[score] }}>
        {label}
      </span>
    </div>
  );
}
