import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, ChevronRight, Layers, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as catalogApi from "@/lib/api/catalog";
import type { CategoryNode } from "@/lib/api/catalog";
import { ApiError } from "@/lib/api/client";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

const content = {
  uz: {
    title: "Katalog",
    sub: "Mahsulot/xizmat bo'limlari ierarxiyasi",
    addRoot: "Yangi bo'lim",
    create: "Qo'shish",
    cancel: "Bekor qilish",
    save: "Saqlash",
    empty: "Hali bo'limlar yo'q",
    emptyDesc: "Birinchi bo'limni qo'shing.",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    genericError: "Xatolik yuz berdi",
    nameTaken: "Bu nomda birodar bo'lim allaqachon mavjud",
    created: "Bo'lim qo'shildi",
    updated: "Nomi yangilandi",
    deleted: "Bo'lim o'chirildi",
    hasChildren: "Avval ichidagi bo'limlarni o'chiring",
    confirmDeleteTitle: "Bo'limni o'chirasizmi?",
    name: "Nomi",
  },
  ru: {
    title: "Каталог",
    sub: "Иерархия разделов товаров/услуг",
    addRoot: "Новый раздел",
    create: "Добавить",
    cancel: "Отмена",
    save: "Сохранить",
    empty: "Разделов пока нет",
    emptyDesc: "Добавьте первый раздел.",
    loadError: "Не удалось загрузить данные",
    genericError: "Произошла ошибка",
    nameTaken: "Раздел с таким именем уже существует",
    created: "Раздел добавлен",
    updated: "Название обновлено",
    deleted: "Раздел удалён",
    hasChildren: "Сначала удалите вложенные разделы",
    confirmDeleteTitle: "Удалить раздел?",
    name: "Название",
  },
};

type Lang = keyof typeof content;

function CategoryRow({
  node,
  depth,
  lang,
  accessToken,
  onChanged,
  onError,
}: {
  node: CategoryNode;
  depth: number;
  lang: Lang;
  accessToken: string;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const t = content[lang];
  const [expanded, setExpanded] = useState(depth === 0);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleAddChild() {
    setBusy(true);
    try {
      await catalogApi.createCategory(accessToken, { name: newName.trim(), parent_id: node.id });
      toast.success(t.created);
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

  async function handleRename() {
    if (editName.trim() === node.name) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await catalogApi.updateCategory(accessToken, node.id, editName.trim());
      toast.success(t.updated);
      setEditing(false);
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
      toast.success(t.deleted);
      setConfirmDelete(false);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) toast.error(t.hasChildren);
      else onError(err instanceof ApiError ? err.detail : t.genericError);
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginLeft: depth > 0 ? 20 : 0 }}>
      <div className="border-card-border/60 group flex items-center gap-2 border-b py-2.5">
        {node.children.length > 0 ? (
          <button onClick={() => setExpanded((e) => !e)} className="text-foreground-muted shrink-0">
            <ChevronRight size={16} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {editing ? (
          <>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="border-card-border bg-input-background text-foreground h-8 flex-1 rounded-lg border px-2.5 text-sm outline-none"
              autoFocus
            />
            <Button variant="gold" size="sm" disabled={busy} onClick={handleRename}>
              {t.save}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
              <X size={14} />
            </Button>
          </>
        ) : (
          <>
            <Layers size={14} className="text-foreground-muted shrink-0" />
            <span className="flex-1 text-sm font-medium text-foreground">{node.name}</span>
            <button
              onClick={() => setAddOpen((o) => !o)}
              className="text-foreground-muted hover:text-primary opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="add child"
            >
              <Plus size={15} />
            </button>
            <button
              onClick={() => {
                setEditName(node.name);
                setEditing(true);
              }}
              className="text-foreground-muted hover:text-primary opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="rename"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-foreground-muted hover:text-destructive opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="delete"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>

      {addOpen && (
        <div className="my-2 flex items-center gap-2" style={{ marginLeft: 20 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t.name}
            className="border-card-border bg-input-background text-foreground h-8 flex-1 rounded-lg border px-2.5 text-sm outline-none"
            autoFocus
          />
          <Button variant="gold" size="sm" disabled={!newName.trim() || busy} onClick={handleAddChild}>
            {t.create}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>
            {t.cancel}
          </Button>
        </div>
      )}

      {expanded &&
        node.children.map((child) => (
          <CategoryRow
            key={child.id}
            node={child}
            depth={depth + 1}
            lang={lang}
            accessToken={accessToken}
            onChanged={onChanged}
            onError={onError}
          />
        ))}

      <ConfirmDialog
        open={confirmDelete}
        title={t.confirmDeleteTitle}
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

export function CatalogPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken } = useTenantAuth();

  const [tree, setTree] = useState<CategoryNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rootFormOpen, setRootFormOpen] = useState(false);
  const [rootName, setRootName] = useState("");
  const [savingRoot, setSavingRoot] = useState(false);

  async function load() {
    if (!accessToken) return;
    setError(null);
    try {
      setTree(await catalogApi.listCategories(accessToken));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.loadError);
    }
  }

  useEffect(() => {
    if (accessToken) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function handleCreateRoot() {
    if (!accessToken) return;
    setSavingRoot(true);
    try {
      await catalogApi.createCategory(accessToken, { name: rootName.trim() });
      toast.success(t.created);
      setRootName("");
      setRootFormOpen(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) toast.error(t.nameTaken);
      else setError(err instanceof ApiError ? err.detail : t.genericError);
    } finally {
      setSavingRoot(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 sm:mb-8">
        <div>
          <h1 className="font-heading mb-1 text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
          <p className="text-sm text-foreground-muted">{t.sub}</p>
        </div>
        <Button variant="gold" onClick={() => setRootFormOpen((o) => !o)}>
          {rootFormOpen ? <X size={16} /> : <Plus size={16} />}
          {t.addRoot}
        </Button>
      </div>

      {rootFormOpen && (
        <div className="glass-card mb-6 flex items-end gap-3 p-5">
          <FormField label={t.name} value={rootName} onChange={(e) => setRootName(e.target.value)} className="mb-0 flex-1" />
          <Button variant="gold" disabled={!rootName.trim() || savingRoot} onClick={handleCreateRoot}>
            {savingRoot && <Loader2 size={16} className="animate-spin" />}
            {t.create}
          </Button>
        </div>
      )}

      {error && (
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center">
          <AlertCircle size={28} className="text-destructive" />
          <p className="text-sm text-foreground-muted">{error}</p>
        </div>
      )}

      {!error && tree === null && (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="text-primary animate-spin" />
        </div>
      )}

      {!error && tree !== null && tree.length === 0 && (
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center sm:p-14">
          <Layers size={32} className="text-foreground-muted" />
          <h2 className="font-heading text-lg font-bold text-foreground">{t.empty}</h2>
          <p className="max-w-md text-sm text-foreground-muted">{t.emptyDesc}</p>
        </div>
      )}

      {!error && tree !== null && tree.length > 0 && accessToken && (
        <div className="glass-card p-4 sm:p-5">
          {tree.map((node) => (
            <CategoryRow
              key={node.id}
              node={node}
              depth={0}
              lang={lang}
              accessToken={accessToken}
              onChanged={load}
              onError={setError}
            />
          ))}
        </div>
      )}
    </main>
  );
}
