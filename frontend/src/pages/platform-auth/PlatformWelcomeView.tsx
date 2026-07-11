import { useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { Building2, CheckCircle2 } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { usePlatformAuth } from "@/lib/auth/platformAuthStore";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    title: "Xush kelibsiz!",
    desc: "Platform Admin sifatida kirdingiz. To'liq konsol hozircha ishlab chiqilmoqda — hozircha yangi tenant va uning birinchi Admin foydalanuvchisini shu yerdan yaratishingiz mumkin.",
    newTenant: "Yangi tenant yaratish",
    logout: "Chiqish",
  },
  ru: {
    title: "Добро пожаловать!",
    desc: "Вы вошли как Platform Admin. Полная консоль пока в разработке — пока отсюда можно создать нового тенанта и его первого Admin-пользователя.",
    newTenant: "Создать нового тенанта",
    logout: "Выйти",
  },
};

export function PlatformWelcomeView() {
  const { lang } = useLang();
  const t = content[lang];
  const navigate = useNavigate();
  const { status, totpEnabled, logout } = usePlatformAuth();

  useEffect(() => {
    if (status === "anonymous") navigate("/platform/login", { replace: true });
    else if (status === "authenticated" && !totpEnabled) navigate("/platform/2fa-setup", { replace: true });
  }, [status, totpEnabled, navigate]);

  if (status !== "authenticated" || !totpEnabled) return null;

  return (
    <AuthCard className="text-center">
      <div className="border-success/25 bg-success/12 mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border">
        <CheckCircle2 size={28} className="text-success" />
      </div>
      <h2 className="font-heading mb-2 text-2xl font-extrabold text-foreground">{t.title}</h2>
      <p className="mb-8 text-sm leading-relaxed text-foreground-muted">{t.desc}</p>
      <Button variant="gold" size="lg" className="mb-3 w-full" asChild>
        <Link to="/platform/tenants/new">
          <Building2 size={16} />
          {t.newTenant}
        </Link>
      </Button>
      <Button variant="outline" size="lg" className="w-full" onClick={() => logout().then(() => navigate("/"))}>
        {t.logout}
      </Button>
    </AuthCard>
  );
}
