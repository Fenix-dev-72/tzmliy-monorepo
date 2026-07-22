import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  ChevronRight,
  ImagePlus,
  Layers,
  Loader2,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as catalogApi from "@/lib/api/catalog";
import type { CategoryNode } from "@/lib/api/catalog";
import * as productsApi from "@/lib/api/products";
import type { Product } from "@/lib/api/products";
import { ApiError } from "@/lib/api/client";
import { formatMoney } from "@/lib/format/money";
import { stockStatus } from "@/lib/format/stock";
import { ProductPhoto } from "@/components/shared/ProductPhoto";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

const content = {
  uz: {
    title: "Mahsulotlar",
    sub: "Katalogingizdagi barcha mahsulotlarni boshqaring",
    addProduct: "Mahsulot qo'shish",
    categories: "Kategoriyalar",
    searchCategories: "Kategoriyalarni qidirish...",
    allCategories: "Barcha kategoriyalar",
    addCategory: "Kategoriya qo'shish",
    searchProducts: "Mahsulot qidirish...",
    product: "Mahsulot",
    category: "Kategoriya",
    price: "Narx",
    costPrice: "Tan narx",
    stock: "Soni",
    status: "Holat",
    actions: "Amallar",
    noProducts: "Bu bo'limda mahsulot topilmadi",
    total: "ta mahsulot",
    critical: "Tugagan",
    low: "Kam qoldi",
    normal: "Faol",
    create: "Qo'shish",
    save: "Saqlash",
    cancel: "Bekor qilish",
    newProductTitle: "Yangi mahsulot qo'shish",
    editProductTitle: "Mahsulotni tahrirlash",
    productName: "Mahsulot nomi *",
    productNamePlaceholder: "Mahsulot nomini kiriting",
    categoryField: "Kategoriya *",
    selectCategory: "Kategoriyani tanlang",
    photo: "Mahsulot rasmi",
    uploadPhoto: "Rasm yuklash",
    priceField: "Narxi (sotish)",
    costPriceField: "Tan narxi",
    initialStock: "Boshlang'ich soni",
    confirmDeleteTitle: "Mahsulotni o'chirasizmi?",
    productHasSales: "Bu mahsulot bo'yicha savdolar mavjud, o'chirib bo'lmaydi",
    created: "Mahsulot qo'shildi",
    updated: "Mahsulot yangilandi",
    deleted: "Mahsulot o'chirildi",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    genericError: "Xatolik yuz berdi",
    nameTaken: "Bu nomda birodar kategoriya allaqachon mavjud",
    hasChildren: "Avval ichidagi bo'limlarni o'chiring",
    hasProducts: "Avval bu bo'limdagi mahsulotlarni o'chiring yoki ko'chiring",
    confirmDeleteCategoryTitle: "Kategoriyani o'chirasizmi?",
    invalidPrice: "Narxlarni to'g'ri kiriting",
    invalidStock: "Sonni to'g'ri kiriting",
    name: "Nomi",
  },
  ru: {
    title: "Продукты",
    sub: "Управляйте всеми товарами вашего каталога",
    addProduct: "Добавить товар",
    categories: "Категории",
    searchCategories: "Поиск категорий...",
    allCategories: "Все категории",
    addCategory: "Добавить категорию",
    searchProducts: "Поиск товара...",
    product: "Товар",
    category: "Категория",
    price: "Цена",
    costPrice: "Себестоимость",
    stock: "Кол-во",
    status: "Статус",
    actions: "Действия",
    noProducts: "В этом разделе товаров не найдено",
    total: "товаров",
    critical: "Закончился",
    low: "Мало осталось",
    normal: "Активен",
    create: "Добавить",
    save: "Сохранить",
    cancel: "Отмена",
    newProductTitle: "Добавить новый товар",
    editProductTitle: "Редактировать товар",
    productName: "Название товара *",
    productNamePlaceholder: "Введите название товара",
    categoryField: "Категория *",
    selectCategory: "Выберите категорию",
    photo: "Фото товара",
    uploadPhoto: "Загрузить фото",
    priceField: "Цена (продажа)",
    costPriceField: "Себестоимость",
    initialStock: "Начальное количество",
    confirmDeleteTitle: "Удалить товар?",
    productHasSales: "У этого товара есть продажи, удалить нельзя",
    created: "Товар добавлен",
    updated: "Товар обновлён",
    deleted: "Товар удалён",
    loadError: "Не удалось загрузить данные",
    genericError: "Произошла ошибка",
    nameTaken: "Раздел с таким именем уже существует",
    hasChildren: "Сначала удалите вложенные разделы",
    hasProducts: "Сначала удалите или перенесите товары этого раздела",
    confirmDeleteCategoryTitle: "Удалить раздел?",
    invalidPrice: "Укажите корректные цены",
    invalidStock: "Укажите корректное количество",
    name: "Название",
  },
};

type Lang = keyof typeof content;
type T = (typeof content)["uz"];

function flattenTree(nodes: CategoryNode[], depth = 0): { id: string; label: string; name: string }[] {
  return nodes.flatMap((n) => [
    { id: n.id, label: `${"— ".repeat(depth)}${n.name}`, name: n.name },
    ...flattenTree(n.children, depth + 1),
  ]);
}

function categoryName(flat: { id: string; name: string }[], id: string): string {
  return flat.find((c) => c.id === id)?.name ?? "—";
}

function CategoryTreeItem({
  node,
  depth,
  productCounts,
  selectedId,
  onSelect,
  lang,
  accessToken,
  onChanged,
  onError,
  canManage,
}: {
  node: CategoryNode;
  depth: number;
  productCounts: Map<string, number>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  lang: Lang;
  accessToken: string;
  onChanged: () => void;
  onError: (msg: string) => void;
  canManage: boolean;
}) {
  const t = content[lang];
  const [expanded, setExpanded] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleAddChild() {
    setBusy(true);
    try {
      await catalogApi.createCategory(accessToken, { name: newName.trim(), parent_id: node.id });
      setNewName("");
      setAddOpen(false);
      setExpanded(true);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) toast.error(t.nameTaken);
      else onError(err instanceof ApiError ? err.detail : t.genericError);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await catalogApi.deleteCategory(accessToken, node.id);
      setConfirmDelete(false);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error(err.detail.toLowerCase().includes("product") ? t.hasProducts : t.hasChildren);
      } else onError(err instanceof ApiError ? err.detail : t.genericError);
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  const count = productCounts.get(node.id) ?? 0;

  return (
    <div>
      <div
        className={`group flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm ${
          selectedId === node.id ? "bg-primary/10 text-primary font-semibold" : "text-foreground hover:bg-accent"
        }`}
        style={{ marginLeft: depth > 0 ? 14 : 0 }}
      >
        {node.children.length > 0 ? (
          <button onClick={() => setExpanded((e) => !e)} className="text-foreground-muted shrink-0">
            <ChevronRight size={13} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
        ) : (
          <span className="w-[13px] shrink-0" />
        )}
        <button onClick={() => onSelect(node.id)} className="min-w-0 flex-1 truncate text-left">
          {node.name}
        </button>
        <span className="text-foreground-muted text-xs">{count}</span>
        {canManage && (
          <>
            <button
              onClick={() => setAddOpen((o) => !o)}
              className="text-foreground-muted hover:text-primary shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="add"
            >
              <Plus size={12} />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-foreground-muted hover:text-destructive shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="delete"
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>

      {addOpen && canManage && (
        <div className="my-1 flex items-center gap-1.5" style={{ marginLeft: depth * 14 + 20 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="border-card-border bg-input-background text-foreground h-7 flex-1 rounded-md border px-2 text-xs outline-none"
            autoFocus
          />
          <button disabled={!newName.trim() || busy} onClick={handleAddChild} className="text-primary text-xs font-semibold disabled:opacity-50">
            {t.create}
          </button>
        </div>
      )}

      {expanded &&
        node.children.map((child) => (
          <CategoryTreeItem
            key={child.id}
            node={child}
            depth={depth + 1}
            productCounts={productCounts}
            selectedId={selectedId}
            onSelect={onSelect}
            lang={lang}
            accessToken={accessToken}
            onChanged={onChanged}
            onError={onError}
            canManage={canManage}
          />
        ))}

      <ConfirmDialog
        open={confirmDelete}
        title={t.confirmDeleteCategoryTitle}
        confirmLabel={t.deleted}
        cancelLabel={t.cancel}
        destructive
        loading={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function ProductDrawer({
  t,
  accessToken,
  editing,
  flatCategories,
  defaultCategoryId,
  onClose,
  onSaved,
}: {
  t: T;
  accessToken: string;
  editing: Product | null;
  flatCategories: { id: string; label: string; name: string }[];
  defaultCategoryId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [categoryId, setCategoryId] = useState(editing?.category_id ?? defaultCategoryId ?? "");
  const [sellPrice, setSellPrice] = useState(
    editing ? String(editing.sell_price_currency === "USD" ? editing.sell_price_amount / 100 : editing.sell_price_amount) : "",
  );
  const [sellCurrency, setSellCurrency] = useState<string>(editing?.sell_price_currency ?? "UZS");
  const [costPrice, setCostPrice] = useState(
    editing ? String(editing.cost_price_currency === "USD" ? editing.cost_price_amount / 100 : editing.cost_price_amount) : "",
  );
  const [costCurrency, setCostCurrency] = useState<string>(editing?.cost_price_currency ?? "UZS");
  const [stock, setStock] = useState("0");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function parseAmount(raw: string, currency: string): number | null {
    const num = Number(raw);
    if (!raw.trim() || !Number.isFinite(num) || num < 0) return null;
    return currency === "USD" ? Math.round(num * 100) : Math.round(num);
  }

  function handlePhotoChange(file: File | null) {
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  async function handleSave() {
    const sellAmount = parseAmount(sellPrice, sellCurrency);
    const costAmount = parseAmount(costPrice, costCurrency);
    if (sellAmount === null || costAmount === null || !categoryId || !name.trim()) {
      toast.error(t.invalidPrice);
      return;
    }
    setSaving(true);
    try {
      let productId: string;
      if (editing) {
        await productsApi.updateProduct(accessToken, editing.id, {
          name: name.trim(),
          category_id: categoryId,
          cost_price_amount: costAmount,
          cost_price_currency: costCurrency as "UZS" | "USD",
          sell_price_amount: sellAmount,
          sell_price_currency: sellCurrency as "UZS" | "USD",
        });
        productId = editing.id;
        toast.success(t.updated);
      } else {
        const stockNum = Number(stock);
        if (!Number.isFinite(stockNum) || stockNum < 0) {
          toast.error(t.invalidStock);
          setSaving(false);
          return;
        }
        const created = await productsApi.createProduct(accessToken, {
          name: name.trim(),
          category_id: categoryId,
          cost_price_amount: costAmount,
          cost_price_currency: costCurrency as "UZS" | "USD",
          sell_price_amount: sellAmount,
          sell_price_currency: sellCurrency as "UZS" | "USD",
          stock_quantity: Math.round(stockNum),
        });
        productId = created.id;
        toast.success(t.created);
      }
      if (photoFile) await productsApi.uploadProductPhoto(accessToken, productId, photoFile);
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : t.genericError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="bg-background/70 absolute inset-0 backdrop-blur-sm" onClick={onClose} />
      <div className="glass-card auth-card-enter relative flex h-full w-full max-w-sm flex-col overflow-y-auto rounded-none p-6 sm:rounded-l-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-heading text-lg font-bold text-foreground">{editing ? t.editProductTitle : t.newProductTitle}</h3>
          <button onClick={onClose} className="text-foreground-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <label className="text-foreground mb-1.5 block text-sm font-medium">{t.productName}</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.productNamePlaceholder}
          className="border-card-border bg-input-background text-foreground mb-4 h-10 w-full rounded-lg border px-3 text-sm outline-none"
        />

        <label className="text-foreground mb-1.5 block text-sm font-medium">{t.categoryField}</label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="border-card-border bg-input-background text-foreground mb-4 h-10 w-full rounded-lg border px-3 text-sm outline-none"
        >
          <option value="">{t.selectCategory}</option>
          {flatCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        <label className="text-foreground mb-1.5 block text-sm font-medium">{t.photo}</label>
        <div className="mb-4 flex items-center gap-3">
          {photoPreview ? (
            <img src={photoPreview} alt="" className="size-14 rounded-lg object-cover" />
          ) : editing ? (
            <ProductPhoto accessToken={accessToken} product={editing} size={56} />
          ) : (
            <div className="bg-accent text-foreground-muted flex size-14 items-center justify-center rounded-lg">
              <Package size={22} />
            </div>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="border-card-border text-foreground-muted hover:text-foreground flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs"
          >
            <ImagePlus size={14} />
            {t.uploadPhoto}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
          />
        </div>

        <label className="text-foreground mb-1.5 block text-sm font-medium">{t.priceField}</label>
        <div className="mb-4 flex gap-2">
          <input
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value)}
            type="number"
            min={0}
            placeholder="1500000"
            className="border-card-border bg-input-background text-foreground h-10 flex-1 rounded-lg border px-3 text-sm outline-none"
          />
          <select
            value={sellCurrency}
            onChange={(e) => setSellCurrency(e.target.value)}
            className="border-card-border bg-input-background text-foreground h-10 rounded-lg border px-2 text-sm outline-none"
          >
            <option value="UZS">UZS</option>
            <option value="USD">USD</option>
          </select>
        </div>

        <label className="text-foreground mb-1.5 block text-sm font-medium">{t.costPriceField}</label>
        <div className="mb-4 flex gap-2">
          <input
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
            type="number"
            min={0}
            placeholder="1200000"
            className="border-card-border bg-input-background text-foreground h-10 flex-1 rounded-lg border px-3 text-sm outline-none"
          />
          <select
            value={costCurrency}
            onChange={(e) => setCostCurrency(e.target.value)}
            className="border-card-border bg-input-background text-foreground h-10 rounded-lg border px-2 text-sm outline-none"
          >
            <option value="UZS">UZS</option>
            <option value="USD">USD</option>
          </select>
        </div>

        {!editing && (
          <>
            <label className="text-foreground mb-1.5 block text-sm font-medium">{t.initialStock}</label>
            <input
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              type="number"
              min={0}
              className="border-card-border bg-input-background text-foreground mb-4 h-10 w-full rounded-lg border px-3 text-sm outline-none"
            />
          </>
        )}

        <div className="mt-auto flex gap-3 pt-4">
          <Button variant="gold" className="flex-1" disabled={saving || !name.trim() || !categoryId} onClick={handleSave}>
            {saving && <Loader2 size={16} className="animate-spin" />}
            {t.save}
          </Button>
          <Button variant="outline" className="flex-1" onClick={onClose}>
            {t.cancel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ProductsPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken, user } = useTenantAuth();
  const canManage = user?.permissions.includes("catalog.manage") ?? false;

  const [tree, setTree] = useState<CategoryNode[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categorySearch, setCategorySearch] = useState("");
  const [productSearch, setProductSearch] = useState("");

  const [addRootOpen, setAddRootOpen] = useState(false);
  const [rootName, setRootName] = useState("");
  const [savingRoot, setSavingRoot] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    if (!accessToken) return;
    setError(null);
    try {
      const [treeData, productsData] = await Promise.all([catalogApi.listCategories(accessToken), productsApi.listProducts(accessToken)]);
      setTree(treeData);
      setProducts(productsData);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.loadError);
    }
  }

  useEffect(() => {
    if (accessToken) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const flatCategories = useMemo(() => flattenTree(tree ?? []), [tree]);

  const productCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products ?? []) map.set(p.category_id, (map.get(p.category_id) ?? 0) + 1);
    return map;
  }, [products]);

  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return tree ?? [];
    const q = categorySearch.toLowerCase();
    const filterNode = (n: CategoryNode): CategoryNode | null => {
      const children = n.children.map(filterNode).filter((c): c is CategoryNode => c !== null);
      if (n.name.toLowerCase().includes(q) || children.length > 0) return { ...n, children };
      return null;
    };
    return (tree ?? []).map(filterNode).filter((n): n is CategoryNode => n !== null);
  }, [tree, categorySearch]);

  const visibleProducts = useMemo(() => {
    let list = products ?? [];
    if (selectedCategoryId) list = list.filter((p) => p.category_id === selectedCategoryId);
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [products, selectedCategoryId, productSearch]);

  async function handleCreateRoot() {
    if (!accessToken) return;
    setSavingRoot(true);
    try {
      await catalogApi.createCategory(accessToken, { name: rootName.trim() });
      setRootName("");
      setAddRootOpen(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) toast.error(t.nameTaken);
      else setError(err instanceof ApiError ? err.detail : t.genericError);
    } finally {
      setSavingRoot(false);
    }
  }

  async function handleDeleteProduct() {
    if (!accessToken || !deleteTarget) return;
    setDeleting(true);
    try {
      await productsApi.deleteProduct(accessToken, deleteTarget.id);
      toast.success(t.deleted);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) toast.error(t.productHasSales);
      else toast.error(err instanceof ApiError ? err.detail : t.genericError);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const totalCount = products?.length ?? 0;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading mb-1 text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
          <p className="text-sm text-foreground-muted">{t.sub}</p>
        </div>
        {canManage && (
          <Button
            variant="gold"
            onClick={() => {
              setEditingProduct(null);
              setDrawerOpen(true);
            }}
          >
            <PackagePlus size={16} />
            {t.addProduct}
          </Button>
        )}
      </div>

      {error && (
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center">
          <AlertCircle size={28} className="text-destructive" />
          <p className="text-sm text-foreground-muted">{error}</p>
        </div>
      )}

      {!error && (tree === null || products === null) && (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="text-primary animate-spin" />
        </div>
      )}

      {!error && tree !== null && products !== null && accessToken && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]">
          <div className="glass-card h-fit p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{t.categories}</h3>
            </div>
            <div className="border-card-border bg-input-background mb-3 flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
              <Search size={13} className="text-foreground-muted shrink-0" />
              <input
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder={t.searchCategories}
                className="text-foreground placeholder:text-foreground-muted w-full bg-transparent text-xs outline-none"
              />
            </div>

            <button
              onClick={() => setSelectedCategoryId(null)}
              className={`mb-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm ${
                selectedCategoryId === null ? "bg-primary/10 text-primary font-semibold" : "text-foreground hover:bg-accent"
              }`}
            >
              <Layers size={13} className="shrink-0" />
              <span className="flex-1 text-left">{t.allCategories}</span>
              <span className="text-foreground-muted text-xs">{totalCount}</span>
            </button>

            <div className="max-h-[420px] overflow-y-auto">
              {filteredCategories.map((node) => (
                <CategoryTreeItem
                  key={node.id}
                  node={node}
                  depth={0}
                  productCounts={productCounts}
                  selectedId={selectedCategoryId}
                  onSelect={setSelectedCategoryId}
                  lang={lang}
                  accessToken={accessToken}
                  onChanged={load}
                  onError={setError}
                  canManage={canManage}
                />
              ))}
            </div>

            {canManage &&
              (addRootOpen ? (
                <div className="mt-2 flex items-center gap-1.5">
                  <input
                    value={rootName}
                    onChange={(e) => setRootName(e.target.value)}
                    className="border-card-border bg-input-background text-foreground h-8 flex-1 rounded-lg border px-2 text-xs outline-none"
                    autoFocus
                  />
                  <Button variant="gold" size="sm" disabled={!rootName.trim() || savingRoot} onClick={handleCreateRoot}>
                    {savingRoot && <Loader2 size={12} className="animate-spin" />}
                    {t.create}
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => setAddRootOpen(true)}>
                  <Plus size={13} />
                  {t.addCategory}
                </Button>
              ))}
          </div>

          <div className="glass-card p-4 sm:p-5">
            <div className="border-card-border bg-input-background mb-4 flex max-w-sm items-center gap-2 rounded-lg border px-3 py-2">
              <Search size={14} className="text-foreground-muted shrink-0" />
              <input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder={t.searchProducts}
                className="text-foreground placeholder:text-foreground-muted w-full bg-transparent text-sm outline-none"
              />
            </div>

            {visibleProducts.length === 0 ? (
              <p className="text-foreground-muted py-10 text-center text-sm">{t.noProducts}</p>
            ) : (
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="text-foreground-muted border-card-border/60 border-b text-xs">
                      <th className="px-2 py-2 text-left font-medium">{t.product}</th>
                      <th className="px-2 py-2 text-left font-medium">{t.category}</th>
                      <th className="px-2 py-2 text-right font-medium">{t.price}</th>
                      <th className="px-2 py-2 text-right font-medium">{t.costPrice}</th>
                      <th className="px-2 py-2 text-right font-medium">{t.stock}</th>
                      <th className="px-2 py-2 text-left font-medium">{t.status}</th>
                      {canManage && <th className="px-2 py-2 text-right font-medium">{t.actions}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProducts.map((p) => {
                      const status = stockStatus(p.stock_quantity, t);
                      return (
                        <tr key={p.id} className="border-card-border/60 border-b last:border-0">
                          <td className="px-2 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <ProductPhoto accessToken={accessToken} product={p} />
                              <span className="max-w-[180px] truncate font-medium text-foreground">{p.name}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2.5">
                            <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap">
                              {categoryName(flatCategories, p.category_id)}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-right font-mono whitespace-nowrap text-foreground">
                            {formatMoney(p.sell_price_amount, p.sell_price_currency)}
                          </td>
                          <td className="px-2 py-2.5 text-right font-mono whitespace-nowrap text-foreground-muted">
                            {formatMoney(p.cost_price_amount, p.cost_price_currency)}
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
                          {canManage && (
                            <td className="px-2 py-2.5">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => {
                                    setEditingProduct(p);
                                    setDrawerOpen(true);
                                  }}
                                  aria-label="edit"
                                  className="text-foreground-muted hover:text-primary flex size-7 items-center justify-center"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  onClick={() => setDeleteTarget(p)}
                                  aria-label="delete"
                                  className="text-foreground-muted hover:text-destructive flex size-7 items-center justify-center"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-foreground-muted mt-4 text-xs">
              {visibleProducts.length} {t.total}
            </p>
          </div>
        </div>
      )}

      {drawerOpen && accessToken && (
        <ProductDrawer
          t={t}
          accessToken={accessToken}
          editing={editingProduct}
          flatCategories={flatCategories}
          defaultCategoryId={selectedCategoryId}
          onClose={() => setDrawerOpen(false)}
          onSaved={() => {
            setDrawerOpen(false);
            load();
          }}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t.confirmDeleteTitle}
        confirmLabel={t.deleted}
        cancelLabel={t.cancel}
        destructive
        loading={deleting}
        onConfirm={handleDeleteProduct}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}
