import { Link } from "react-router";

export function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <h1 className="font-heading text-4xl font-extrabold">404</h1>
      <p className="text-foreground-muted">Sahifa topilmadi</p>
      <Link to="/" className="text-primary font-semibold">
        Bosh sahifaga qaytish
      </Link>
    </div>
  );
}
