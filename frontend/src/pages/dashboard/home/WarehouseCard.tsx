import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Loader2, Package, Warehouse } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import * as productsApi from "@/lib/api/products";
import type { Product } from "@/lib/api/products";

const content = {
  uz: {
    title: "Ombordagi mahsulotlar",
    seeAll: "Barchasini ko'rish",
    empty: "Hali mahsulot yo'q",
    remaining: "dona",
    critical: "Tugagan",
    low: "Kam qoldi",
    normal: "Yetarli",
  },
  ru: {
    title: "Складские товары",
    seeAll: "Показать все",
    empty: "Товаров пока нет",
    remaining: "шт",
    critical: "Закончился",
    low: "Мало осталось",
    normal: "В наличии",
  },
};

const STOCK_LOW_THRESHOLD = 5;

function stockBadge(qty: number, t: (typeof content)["uz"]): { label: string; color: string } {
  if (qty <= 0) return { label: t.critical, color: "#EF4444" };
  if (qty <= STOCK_LOW_THRESHOLD) return { label: t.low, color: "#F59E0B" };
  return { label: t.normal, color: "#10B981" };
}

function ProductThumb({ accessToken, product }: { accessToken: string; product: Product }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!product.photo_object_key) return;
    productsApi
      .getProductPhotoUrl(accessToken, product.id)
      .then((r) => setUrl(r.photo_url))
      .catch(() => setUrl(null));
  }, [accessToken, product.id, product.photo_object_key]);

  if (url) {
    return <img src={url} alt={product.name} className="size-11 shrink-0 rounded-lg object-cover" />;
  }
  return (
    <div className="bg-accent text-foreground-muted flex size-11 shrink-0 items-center justify-center rounded-lg">
      <Package size={18} />
    </div>
  );
}

export function WarehouseCard({ accessToken }: { accessToken: string }) {
  const { lang } = useLang();
  const t = content[lang];
  const [products, setProducts] = useState<Product[] | null>(null);

  useEffect(() => {
    productsApi
      .listProducts(accessToken)
      .then(setProducts)
      .catch(() => setProducts([]));
  }, [accessToken]);

  const maxStock = useMemo(() => Math.max(1, ...(products ?? []).map((p) => p.stock_quantity)), [products]);

  return (
    <div className="glass-card card-hover-lift auth-card-enter p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Warehouse size={18} className="text-primary shrink-0" />
          <h3 className="text-sm font-semibold text-foreground">{t.title}</h3>
        </div>
        <Link to="/dashboard/products" className="text-primary text-xs font-semibold whitespace-nowrap">
          {t.seeAll}
        </Link>
      </div>

      {products === null && (
        <div className="flex justify-center py-6">
          <Loader2 size={20} className="text-primary animate-spin" />
        </div>
      )}

      {products !== null && products.length === 0 && (
        <p className="py-6 text-center text-sm text-foreground-muted">{t.empty}</p>
      )}

      {products !== null && products.length > 0 && (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {products.map((p) => {
            const badge = stockBadge(p.stock_quantity, t);
            const pct = Math.min(100, Math.round((p.stock_quantity / maxStock) * 100));
            return (
              <div key={p.id} className="border-card-border w-44 shrink-0 rounded-xl border p-3">
                <div className="mb-2 flex items-center gap-2.5">
                  <ProductThumb accessToken={accessToken} product={p} />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-foreground">{p.name}</div>
                    <div className="text-foreground-muted text-[11px]">
                      {p.stock_quantity} {t.remaining}
                    </div>
                  </div>
                </div>
                <div className="bg-accent h-1.5 w-full overflow-hidden rounded-full">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: badge.color }} />
                </div>
                <div className="mt-1 text-[10px] font-semibold" style={{ color: badge.color }}>
                  {badge.label}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
