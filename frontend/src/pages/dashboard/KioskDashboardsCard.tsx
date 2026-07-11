import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Monitor, Plus, Trash2, X } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as analyticsApi from "@/lib/api/analytics";
import type { KioskDashboard } from "@/lib/api/analytics";
import { ApiError } from "@/lib/api/client";
import { FormField } from "@/components/auth/FormField";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

const content = {
  uz: {
    title: "Kiosk ekranlar",
    desc: "TV/kiosk ekranida jonli reyting ko'rsatish uchun alohida login yarating (/tv sahifasida ishlatiladi).",
    add: "Yangi ekran",
    name: "Ekran nomi",
    password: "Parol",
    create: "Yaratish",
    cancel: "Bekor qilish",
    nameTaken: "Bu nomda ekran allaqachon mavjud",
    genericError: "Xatolik yuz berdi",
    created: "Ekran yaratildi",
    deleted: "Ekran o'chirildi",
    confirmDeleteTitle: "Ekranni o'chirasizmi?",
    empty: "Hali ekranlar yo'q",
  },
  ru: {
    title: "Kiosk-экраны",
    desc: "Создайте отдельный логин для отображения живого рейтинга на TV/kiosk-экране (используется на странице /tv).",
    add: "Новый экран",
    name: "Название экрана",
    password: "Пароль",
    create: "Создать",
    cancel: "Отмена",
    nameTaken: "Экран с таким именем уже существует",
    genericError: "Произошла ошибка",
    created: "Экран создан",
    deleted: "Экран удалён",
    confirmDeleteTitle: "Удалить экран?",
    empty: "Экранов пока нет",
  },
};

export function KioskDashboardsCard() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken } = useTenantAuth();

  const [dashboards, setDashboards] = useState<KioskDashboard[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KioskDashboard | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    if (!accessToken) return;
    try {
      setDashboards(await analyticsApi.listDashboards(accessToken));
    } catch {
      setDashboards([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function handleCreate() {
    if (!accessToken) return;
    setSaving(true);
    try {
      await analyticsApi.createDashboard(accessToken, { name: name.trim(), password });
      toast.success(t.created);
      setName("");
      setPassword("");
      setFormOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 409 ? t.nameTaken : t.genericError);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!accessToken || !deleteTarget) return;
    setDeleting(true);
    try {
      await analyticsApi.deleteDashboard(accessToken, deleteTarget.id);
      toast.success(t.deleted);
      setDeleteTarget(null);
      await load();
    } catch {
      toast.error(t.genericError);
    } finally {
      setDeleting(false);
    }
  }

  const canSubmit = name.trim().length > 0 && password.length >= 8;

  return (
    <div className="glass-card p-6 sm:p-8">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Monitor size={18} className="text-primary" />
          <h2 className="font-heading text-base font-bold text-foreground">{t.title}</h2>
        </div>
        <Button variant="outline" size="sm" onClick={() => setFormOpen((o) => !o)}>
          {formOpen ? <X size={14} /> : <Plus size={14} />}
          {t.add}
        </Button>
      </div>
      <p className="mb-4 text-xs text-foreground-muted">{t.desc}</p>

      {formOpen && (
        <div className="border-card-border mb-4 rounded-xl border p-4">
          <FormField label={t.name} value={name} onChange={(e) => setName(e.target.value)} />
          <div>
            <FormField label={t.password} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <PasswordStrengthMeter password={password} />
          </div>
          <div className="flex gap-3">
            <Button variant="gold" size="sm" disabled={!canSubmit || saving} onClick={handleCreate}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              {t.create}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setFormOpen(false)}>
              {t.cancel}
            </Button>
          </div>
        </div>
      )}

      {dashboards === null ? (
        <div className="flex justify-center py-6">
          <Loader2 size={20} className="text-primary animate-spin" />
        </div>
      ) : dashboards.length === 0 ? (
        <p className="text-xs text-foreground-muted">{t.empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {dashboards.map((d) => (
            <div key={d.id} className="flex items-center justify-between text-sm">
              <span className="text-foreground">{d.name}</span>
              <button onClick={() => setDeleteTarget(d)} className="text-foreground-muted hover:text-destructive" aria-label="delete">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t.confirmDeleteTitle}
        confirmLabel={t.deleted}
        cancelLabel={t.cancel}
        destructive
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
