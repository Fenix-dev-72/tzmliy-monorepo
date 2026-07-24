import { Link, useRouteError } from "react-router";

// Rendered by react-router as a route `errorElement`: when a route's component
// throws during render (or its lazy chunk fails to load), this shows instead of
// the whole app white-screening. Deliberately self-contained and hook-light --
// an error boundary must never itself throw, so it reads the language straight
// from localStorage (the key LangContext persists to) rather than useLang(),
// which would throw if the provider tree is what broke.

function readLang(): "uz" | "ru" {
  try {
    return localStorage.getItem("tzmliy_lang") === "ru" ? "ru" : "uz";
  } catch {
    return "uz";
  }
}

const TEXT = {
  uz: {
    title: "Kutilmagan xatolik",
    body: "Sahifani ko'rsatishda xatolik yuz berdi. Sahifani qayta yuklashga urinib ko'ring.",
    reload: "Qayta yuklash",
    home: "Bosh sahifaga qaytish",
  },
  ru: {
    title: "Непредвиденная ошибка",
    body: "При отображении страницы произошла ошибка. Попробуйте перезагрузить страницу.",
    reload: "Перезагрузить",
    home: "На главную",
  },
} as const;

export function RouteErrorBoundary() {
  const error = useRouteError();
  const t = TEXT[readLang()];
  const detail = error instanceof Error ? error.message : typeof error === "string" ? error : "";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
      <h1 className="font-heading text-3xl font-extrabold">{t.title}</h1>
      <p className="text-foreground-muted max-w-md">{t.body}</p>
      {detail && (
        <pre className="text-foreground-muted bg-foreground/5 max-w-md overflow-x-auto rounded-lg px-3 py-2 text-left text-xs">
          {detail}
        </pre>
      )}
      <div className="mt-2 flex items-center gap-4">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="bg-primary text-primary-foreground rounded-lg px-4 py-2 font-semibold"
        >
          {t.reload}
        </button>
        <Link to="/" className="text-primary px-4 py-2 font-semibold">
          {t.home}
        </Link>
      </div>
    </div>
  );
}
