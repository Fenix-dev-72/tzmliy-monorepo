import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Loader2, Lock, Plus, ShieldCheck, X } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as rolesApi from "@/lib/api/roles";
import { ROLES_PAGE_SIZE } from "@/lib/api/roles";
import type { Role } from "@/lib/api/roles";
import { ApiError } from "@/lib/api/client";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { DashboardPageContainer } from "@/components/shared/DashboardPageContainer";
import { PaginationBar } from "@/components/shared/PaginationBar";

const content = {
  uz: {
    title: "Rollar",
    sub: "Ruxsatlar va custom rollarni boshqarish",
    newRole: "Yangi rol",
    roleName: "Rol nomi",
    create: "Yaratish",
    cancel: "Bekor qilish",
    save: "Saqlash",
    systemRole: "Tizim roli",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    need2fa: "Rollarni boshqarish uchun 2FA yoqilgan bo'lishi kerak.",
    genericError: "Xatolik yuz berdi",
    nameTaken: "Bu rol nomi allaqachon band",
    created: "Rol yaratildi",
    updated: "Ruxsatlar yangilandi",
    empty: "Rollar topilmadi",
    moduleLabels: {
      users: "Foydalanuvchilar",
      roles: "Rollar",
      catalog: "Mahsulotlar",
      customers: "Mijozlar",
      sales: "Savdolar",
      finance: "Moliya",
      calls: "Qo'ng'iroqlar",
      attendance: "Davomat",
      billing: "To'lovlar",
      notifications: "Bildirishnomalar",
      analytics: "Analitika",
      crm: "Integratsiyalar",
      reports: "Hisobotlar",
    } as Record<string, string>,
    permissionLabels: {
      "users.view": "Foydalanuvchilarni ko'rish",
      "users.manage": "Foydalanuvchilarni boshqarish",
      "roles.view": "Rollarni ko'rish",
      "roles.manage": "Rollarni boshqarish",
      "catalog.view": "Mahsulotlarni ko'rish",
      "catalog.manage": "Mahsulotlarni boshqarish",
      "customers.view": "Mijozlarni ko'rish",
      "customers.view_all": "Barcha mijozlarni ko'rish",
      "customers.manage": "Mijozlarni boshqarish",
      "sales.view": "Savdolarni ko'rish",
      "sales.view_all": "Barcha savdolarni ko'rish",
      "sales.manage": "Savdolarni boshqarish",
      "finance.view": "Moliyani ko'rish",
      "finance.view_all": "Barcha moliyani ko'rish",
      "finance.manage": "Moliyani boshqarish",
      "finance.approve": "Moliyaviy so'rovlarni tasdiqlash",
      "calls.view": "Qo'ng'iroqlarni ko'rish",
      "calls.view_all": "Barcha qo'ng'iroqlarni ko'rish",
      "calls.manage": "Qo'ng'iroqlarni boshqarish",
      "attendance.view": "Davomatni ko'rish",
      "attendance.manage": "Davomatni boshqarish",
      "billing.view": "To'lovlarni ko'rish",
      "billing.manage": "To'lovlarni boshqarish",
      "notifications.view": "Bildirishnomalarni ko'rish",
      "notifications.manage": "Bildirishnomalarni boshqarish",
      "analytics.view": "Analitikani ko'rish",
      "analytics.manage": "Analitikani boshqarish",
      "crm.view": "Integratsiyalarni ko'rish",
      "crm.manage": "Integratsiyalarni boshqarish",
      "reports.view": "Hisobotlarni ko'rish",
      "reports.export": "Hisobotlarni eksport qilish",
    } as Record<string, string>,
  },
  ru: {
    title: "Роли",
    sub: "Управление правами и пользовательскими ролями",
    newRole: "Новая роль",
    roleName: "Название роли",
    create: "Создать",
    cancel: "Отмена",
    save: "Сохранить",
    systemRole: "Системная роль",
    loadError: "Не удалось загрузить данные",
    need2fa: "Для управления ролями требуется включённая 2FA.",
    genericError: "Произошла ошибка",
    nameTaken: "Это название роли уже занято",
    created: "Роль создана",
    updated: "Права обновлены",
    empty: "Роли не найдены",
    moduleLabels: {
      users: "Пользователи",
      roles: "Роли",
      catalog: "Товары",
      customers: "Клиенты",
      sales: "Продажи",
      finance: "Финансы",
      calls: "Звонки",
      attendance: "Посещаемость",
      billing: "Платежи",
      notifications: "Уведомления",
      analytics: "Аналитика",
      crm: "Интеграции",
      reports: "Отчёты",
    } as Record<string, string>,
    permissionLabels: {
      "users.view": "Просмотр пользователей",
      "users.manage": "Управление пользователями",
      "roles.view": "Просмотр ролей",
      "roles.manage": "Управление ролями",
      "catalog.view": "Просмотр товаров",
      "catalog.manage": "Управление товарами",
      "customers.view": "Просмотр клиентов",
      "customers.view_all": "Просмотр всех клиентов",
      "customers.manage": "Управление клиентами",
      "sales.view": "Просмотр продаж",
      "sales.view_all": "Просмотр всех продаж",
      "sales.manage": "Управление продажами",
      "finance.view": "Просмотр финансов",
      "finance.view_all": "Просмотр всех финансов",
      "finance.manage": "Управление финансами",
      "finance.approve": "Одобрение финансовых заявок",
      "calls.view": "Просмотр звонков",
      "calls.view_all": "Просмотр всех звонков",
      "calls.manage": "Управление звонками",
      "attendance.view": "Просмотр посещаемости",
      "attendance.manage": "Управление посещаемостью",
      "billing.view": "Просмотр платежей",
      "billing.manage": "Управление платежами",
      "notifications.view": "Просмотр уведомлений",
      "notifications.manage": "Управление уведомлениями",
      "analytics.view": "Просмотр аналитики",
      "analytics.manage": "Управление аналитикой",
      "crm.view": "Просмотр интеграций",
      "crm.manage": "Управление интеграциями",
      "reports.view": "Просмотр отчётов",
      "reports.export": "Экспорт отчётов",
    } as Record<string, string>,
  },
};

function groupByModule(permissions: string[]) {
  const groups = new Map<string, string[]>();
  for (const p of permissions) {
    const [module] = p.split(".");
    if (!groups.has(module)) groups.set(module, []);
    groups.get(module)!.push(p);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function RolesPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken, user } = useTenantAuth();
  const has2fa = Boolean(user?.totp_enabled);

  const [roles, setRoles] = useState<Role[] | null>(null);
  const [rolesTotal, setRolesTotal] = useState(0);
  const [rolesPage, setRolesPage] = useState(1);
  const [allPermissions, setAllPermissions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  async function load(targetPage: number) {
    if (!accessToken) return;
    setError(null);
    try {
      const [rolesResult, permsData] = await Promise.all([
        rolesApi.listRoles(accessToken, ROLES_PAGE_SIZE, (targetPage - 1) * ROLES_PAGE_SIZE),
        rolesApi.listPermissions(accessToken),
      ]);
      setRoles(rolesResult.items);
      setRolesTotal(rolesResult.total);
      setAllPermissions(permsData);
      setSelectedId((prev) => prev ?? rolesResult.items[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.loadError);
    }
  }

  useEffect(() => {
    if (accessToken) load(rolesPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, rolesPage]);

  const selectedRole = roles?.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedRole) setDraftPermissions(new Set(selectedRole.permissions));
  }, [selectedRole]);

  const groupedPermissions = useMemo(() => groupByModule(allPermissions), [allPermissions]);
  const dirty = selectedRole ? draftPermissions.size !== selectedRole.permissions.length ||
    [...draftPermissions].some((p) => !selectedRole.permissions.includes(p)) : false;

  function togglePermission(key: string) {
    if (!selectedRole || selectedRole.is_system) return;
    setDraftPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSave() {
    if (!accessToken || !selectedRole) return;
    setSaving(true);
    try {
      const updated = await rolesApi.updateRolePermissions(accessToken, selectedRole.id, [...draftPermissions]);
      toast.success(t.updated);
      setRoles((prev) => prev?.map((r) => (r.id === updated.id ? updated : r)) ?? null);
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 403 ? t.need2fa : t.genericError);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    if (!accessToken) return;
    setCreating(true);
    try {
      const role = await rolesApi.createRole(accessToken, { name: newName.trim(), permissions: [] });
      toast.success(t.created);
      setNewName("");
      setFormOpen(false);
      setSelectedId(role.id);
      // New roles sort first (ORDER BY created_at DESC) -- reload page 1 so
      // the just-created role is actually visible on the page it landed on.
      if (rolesPage === 1) await load(1);
      else setRolesPage(1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) toast.error(t.need2fa);
      else if (err instanceof ApiError && err.status === 409) toast.error(t.nameTaken);
      else toast.error(t.genericError);
    } finally {
      setCreating(false);
    }
  }

  return (
    <DashboardPageContainer>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 sm:mb-8">
        <div>
          <h1 className="font-heading mb-1 text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
          <p className="text-sm text-foreground-muted">{t.sub}</p>
        </div>
        <Button variant="gold" onClick={() => setFormOpen((o) => !o)}>
          {formOpen ? <X size={16} /> : <Plus size={16} />}
          {t.newRole}
        </Button>
      </div>

      {formOpen && (
        <div className="glass-card mb-6 flex flex-wrap items-end gap-4 p-5">
          <FormField label={t.roleName} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="OnlineAgent" className="mb-0 flex-1" />
          <Button variant="gold" disabled={newName.trim().length === 0 || creating} onClick={handleCreate}>
            {creating && <Loader2 size={16} className="animate-spin" />}
            {t.create}
          </Button>
          <Button variant="outline" onClick={() => setFormOpen(false)}>
            {t.cancel}
          </Button>
        </div>
      )}

      {error && (
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center">
          <AlertCircle size={28} className="text-destructive" />
          <p className="text-sm text-foreground-muted">{error}</p>
        </div>
      )}

      {!error && roles === null && (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="text-primary animate-spin" />
        </div>
      )}

      {!error && roles !== null && roles.length === 0 && (
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center sm:p-14">
          <ShieldCheck size={32} className="text-foreground-muted" />
          <p className="text-sm text-foreground-muted">{t.empty}</p>
        </div>
      )}

      {!error && roles !== null && roles.length > 0 && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[220px_1fr]">
          <div className="flex flex-col gap-2">
            {/* Each role is its own spaced card, not one tight list (same
                "bo'laklarga bo'l" feedback as Users/Sales/Customers). */}
            {roles.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`bg-card/95 border-card-border flex items-center justify-between gap-2 rounded-[14px] border px-3 py-2.5 text-left text-sm font-medium shadow-sm transition-colors ${
                  selectedId === r.id ? "border-accent-orange/40 bg-accent-orange/12 text-accent-orange" : "text-foreground-muted hover:bg-accent hover:text-foreground"
                }`}
              >
                {r.name}
                {r.is_system && <Lock size={12} className="shrink-0 opacity-60" />}
              </button>
            ))}
            <PaginationBar page={rolesPage} totalPages={Math.ceil(rolesTotal / ROLES_PAGE_SIZE)} onChange={setRolesPage} />
          </div>

          {selectedRole && (
            <div className="glass-card p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-heading text-lg font-bold text-foreground">{selectedRole.name}</h2>
                  {selectedRole.is_system && <span className="text-xs text-foreground-muted">{t.systemRole}</span>}
                </div>
                {!selectedRole.is_system && (
                  <Button variant="gold" size="sm" disabled={!dirty || saving} onClick={handleSave}>
                    {saving && <Loader2 size={14} className="animate-spin" />}
                    {t.save}
                  </Button>
                )}
              </div>

              <div className="flex flex-col gap-5">
                {groupedPermissions.map(([module, keys]) => (
                  <div key={module}>
                    <h3 className="mb-2 text-xs font-bold tracking-wide text-foreground-muted uppercase">
                      {t.moduleLabels[module] ?? module}
                    </h3>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {keys.map((key) => (
                        <label
                          key={key}
                          className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                            selectedRole.is_system ? "opacity-60" : "hover:bg-accent cursor-pointer"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={draftPermissions.has(key)}
                            disabled={selectedRole.is_system}
                            onChange={() => togglePermission(key)}
                            className="accent-primary size-4"
                          />
                          <span className="text-foreground">{t.permissionLabels[key] ?? key}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!has2fa && <p className="mt-6 text-center text-xs text-foreground-muted">{t.need2fa}</p>}
    </DashboardPageContainer>
  );
}
