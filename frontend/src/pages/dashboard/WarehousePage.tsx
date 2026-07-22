import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Loader2, PackagePlus, Warehouse } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as catalogApi from "@/lib/api/catalog";
import * as productsApi from "@/lib/api/products";
import type { Product } from "@/lib/api/products";
import { ApiError } from "@/lib/api/client";
import { formatMoney } from "@/lib/format/money";
import { stockStatus } from "@/lib/format/stock";
import { ProductPhoto } from "@/components/shared/ProductPhoto";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    title: "Ombor",
    sub: "Barcha mahsulotlarning ombordagi holati",
    filterAll: "Barchasi",
    filterCritical: "Tugagan",
    filterLow: "Kam qolgan",
    totalProducts: "Jami mahsulot",
    criticalCount: "Tugagan mahsulotlar",
    lowCount: "Kam qolgan mahsulotlar",
    product: "Mahsulot",
    category: "Kategoriya",
    stock: "Soni",
    status: "Holat",
    restock: "To'ldirish",
    noProducts: "Bu bo'limda mahsulot yo'q",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    genericError: "Xatolik yuz berdi",
    critical: "Tugagan",
    low: "Kam qoldi",
    normal: "Faol",
    restockTitle: "Omborni to'g'irlash",
    restockDesc: "Sonni kiriting, so'ng qo'shish yoki ayirishni tanlang (xato kiritilgan sonni tuzatish uchun ham ishlatiladi).",
    restockAmount: "Son",
    add: "Qo'shish",
    subtract: "Ayirish",
    cancel: "Bekor qilish",
    restocked: "Ombor to'ldirildi",
    corrected: "Ombor tuzatildi",
    invalidStock: "Sonni to'g'ri kiriting",
  },
  ru: {
    title: "Склад",
    sub: "Состояние склада по всем товарам",
    filterAll: "Все",
    filterCritical: "Закончились",
    filterLow: "Мало осталось",
    totalProducts: "Всего товаров",
    criticalCount: "Закончившиеся товары",
    lowCount: "Товары на исходе",
    product: "Товар",
    category: "Категория",
    stock: "Кол-во",
    status: "Статус",
    restock: "Пополнить",
    noProducts: "В этом разделе нет товаров",
    loadError: "Не удалось загрузить данные",
    genericError: "Произошла ошибка",
    critical: "Закончился",
    low: "Мало осталось",
    normal: "Активен",
    restockTitle: "Корректировка склада",
    restockDesc: "Введите количество, затем выберите добавить или вычесть (можно использовать и для исправления ошибочно введённого количества).",
    restockAmount: "Количество",
    add: "Добавить",
    subtract: "Вычесть",
    cancel: "Отмена",
    restocked: "Склад пополнен",
    corrected: "Склад скорректирован",
    invalidStock: "Укажите корректное количество",
  },
};

type T = (typeof content)["uz"];
type Filter = "all" | "critical" | "low";

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="glass-card p-4 sm:p-5">
      <div className="mb-1 text-xs font-semibold text-foreground-muted">{label}</div>
      <div className="font-mono text-2xl font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function RestockDialog({
  t,
  accessToken,
  product,
  onClose,
  onDone,
}: {
  t: T;
  accessToken: string;
  product: Product;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdjust(sign: 1 | -1) {
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      toast.error(t.invalidStock);
      return;
    }
    setSaving(true);
    try {
      await productsApi.adjustStock(accessToken, product.id, sign * Math.round(num));
      toast.success(sign === 1 ? t.restocked : t.corrected);
      onDone();
    } catch (err) {
      // 409 here means subtracting more than what's in stock -- InsufficientStockError.
      toast.error(err instanceof ApiError ? err.detail : t.genericError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="bg-background/80 absolute inset-0 backdrop-blur-sm" onClick={onClose} />
      <div className="glass-card auth-card-enter relative w-full max-w-sm p-6">
        <h3 className="font-heading mb-2 text-lg font-bold text-foreground">{t.restockTitle}</h3>
        <p className="mb-4 text-sm text-foreground-muted">
          {product.name} -- {t.restockDesc}
        </p>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
          min={1}
          placeholder={t.restockAmount}
          autoFocus
          className="border-card-border bg-input-background text-foreground h-10 w-full rounded-lg border px-3 text-sm outline-none"
        />
        <div className="mt-5 flex gap-3">
          <Button variant="gold" className="flex-1" disabled={saving} onClick={() => handleAdjust(1)}>
            {saving && <Loader2 size={16} className="animate-spin" />}
            {t.add}
          </Button>
          <Button variant="outline" className="flex-1" disabled={saving} onClick={() => handleAdjust(-1)}>
            {t.subtract}
          </Button>
        </div>
        <button onClick={onClose} className="text-foreground-muted hover:text-foreground mt-3 w-full text-center text-xs">
          {t.cancel}
        </button>
      </div>
    </div>
  );
}

export function WarehousePage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken, user } = useTenantAuth();
  const canManage = user?.permissions.includes("catalog.manage") ?? false;

  const [products, setProducts] = useState<Product[] | null>(null);
  const [categoryNames, setCategoryNames] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [restockTarget, setRestockTarget] = useState<Product | null>(null);

  async function load() {
    if (!accessToken) return;
    setError(null);
    try {
      const [productsData, tree] = await Promise.all([productsApi.listProducts(accessToken), catalogApi.listCategories(accessToken)]);
      setProducts(productsData);
      const map = new Map<string, string>();
      const walk = (nodes: typeof tree) => {
        for (const n of nodes) {
          map.set(n.id, n.name);
          walk(n.children);
        }
      };
      walk(tree);
      setCategoryNames(map);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.loadError);
    }
  }

  useEffect(() => {
    if (accessToken) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const { criticalCount, lowCount, sorted } = useMemo(() => {
    const list = products ?? [];
    const critical = list.filter((p) => p.stock_quantity <= 0).length;
    const low = list.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= 5).length;
    // Most-depleted first -- the whole point of this page is surfacing what
    // needs restocking, not an alphabetical/creation-order list.
    const bySeverity = [...list].sort((a, b) => a.stock_quantity - b.stock_quantity);
    return { criticalCount: critical, lowCount: low, sorted: bySeverity };
  }, [products]);

  const visible = useMemo(() => {
    if (filter === "critical") return sorted.filter((p) => p.stock_quantity <= 0);
    if (filter === "low") return sorted.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= 5);
    return sorted;
  }, [sorted, filter]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center gap-2.5">
        <Warehouse size={22} className="text-primary" />
        <div>
          <h1 className="font-heading text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
          <p className="text-sm text-foreground-muted">{t.sub}</p>
        </div>
      </div>

      {error && (
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center">
          <AlertCircle size={28} className="text-destructive" />
          <p className="text-sm text-foreground-muted">{error}</p>
        </div>
      )}

      {!error && products === null && (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="text-primary animate-spin" />
        </div>
      )}

      {!error && products !== null && accessToken && (
        <>
          <div className="mb-5 grid grid-cols-1 gap-4 sm:mb-6 sm:grid-cols-3">
            <StatCard label={t.totalProducts} value={products.length} color="var(--foreground)" />
            <StatCard label={t.criticalCount} value={criticalCount} color="#EF4444" />
            <StatCard label={t.lowCount} value={lowCount} color="#F59E0B" />
          </div>

          <div className="mb-5 flex gap-2 sm:mb-6">
            {(["all", "critical", "low"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                  filter === f ? "bg-primary text-primary-foreground" : "glass-card text-foreground-muted hover:text-foreground"
                }`}
              >
                {f === "all" ? t.filterAll : f === "critical" ? t.filterCritical : t.filterLow}
              </button>
            ))}
          </div>

          <div className="glass-card p-4 sm:p-5">
            {visible.length === 0 ? (
              <p className="text-foreground-muted py-10 text-center text-sm">{t.noProducts}</p>
            ) : (
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="text-foreground-muted border-card-border/60 border-b text-xs">
                      <th className="px-2 py-2 text-left font-medium">{t.product}</th>
                      <th className="px-2 py-2 text-left font-medium">{t.category}</th>
                      <th className="px-2 py-2 text-right font-medium">{t.stock}</th>
                      <th className="px-2 py-2 text-left font-medium">{t.status}</th>
                      <th className="px-2 py-2 text-right font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((p) => {
                      const status = stockStatus(p.stock_quantity, t);
                      return (
                        <tr key={p.id} className="border-card-border/60 border-b last:border-0">
                          <td className="px-2 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <ProductPhoto accessToken={accessToken} product={p} />
                              <div className="min-w-0">
                                <div className="max-w-[200px] truncate font-medium text-foreground">{p.name}</div>
                                <div className="text-foreground-muted text-xs">{formatMoney(p.sell_price_amount, p.sell_price_currency)}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-2.5">
                            <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap">
                              {categoryNames.get(p.category_id) ?? "—"}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-right font-mono text-foreground">{p.stock_quantity}</td>
                          <td className="px-2 py-2.5">
                            <span
                              className="rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
                              style={{ background: `${status.color}15`, borderColor: `${status.color}30`, color: status.color }}
                            >
                              {status.label}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            {canManage && (
                              <Button variant="outline" size="sm" onClick={() => setRestockTarget(p)}>
                                <PackagePlus size={13} />
                                {t.restock}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {restockTarget && accessToken && (
        <RestockDialog
          t={t}
          accessToken={accessToken}
          product={restockTarget}
          onClose={() => setRestockTarget(null)}
          onDone={() => {
            setRestockTarget(null);
            load();
          }}
        />
      )}
    </main>
  );
}
