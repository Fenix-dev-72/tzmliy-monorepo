import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { SellerKpiDashboard } from "./SellerKpiDashboard";

const content = {
  uz: { back: "Sotuvchilarga qaytish" },
  ru: { back: "Назад к продавцам" },
};

// Direct-link/bookmarkable route to the same dashboard the Sellers list now
// opens as an in-page modal ("Batafsil") -- SellerKpiDashboard holds all the
// actual rendering/data-fetching, kept here so an existing link never 404s.
export function SellerDetailPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { userId } = useParams<{ userId: string }>();

  if (!userId) return null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <Link to="/dashboard/sellers" className="text-primary mb-4 inline-flex items-center gap-1.5 text-sm font-medium hover:underline">
        <ArrowLeft size={14} /> {t.back}
      </Link>
      <SellerKpiDashboard userId={userId} />
    </main>
  );
}
