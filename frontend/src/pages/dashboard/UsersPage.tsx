import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Loader2, Plus, UserX, Users, X } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as usersApi from "@/lib/api/users";
import type { TenantUserRow } from "@/lib/api/users";
import * as rolesApi from "@/lib/api/roles";
import type { Role } from "@/lib/api/roles";
import { ApiError } from "@/lib/api/client";
import { FormField } from "@/components/auth/FormField";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

const content = {
  uz: {
    title: "Foydalanuvchilar",
    sub: "Tashkilotingiz xodimlari va ularning rollari",
    add: "Xodim qo'shish",
    email: "Email",
    password: "Parol",
    role: "Rol",
    phone: "Telefon (ixtiyoriy)",
    create: "Qo'shish",
    cancel: "Bekor qilish",
    empty: "Hali xodimlar yo'q",
    emptyDesc: "Birinchi xodimingizni qo'shing.",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    emailTaken: "Bu email allaqachon band",
    phoneTaken: "Bu telefon raqami allaqachon band",
    genericError: "Xatolik yuz berdi",
    need2fa: "Xodimlar bilan ishlash uchun 2FA yoqilgan bo'lishi kerak.",
    created: "Xodim qo'shildi",
    roleUpdated: "Rol yangilandi",
    inactive: "Nofaol",
    deactivate: "Faolsizlantirish",
    confirmDeactivateTitle: "Xodimni faolsizlantirasizmi?",
    confirmDeactivateDesc: "Bu amalni qaytarib bo'lmaydi — xodim tizimga kira olmay qoladi.",
    deactivated: "Faolsizlantirildi",
  },
  ru: {
    title: "Пользователи",
    sub: "Сотрудники вашей организации и их роли",
    add: "Добавить сотрудника",
    email: "Email",
    password: "Пароль",
    role: "Роль",
    phone: "Телефон (необязательно)",
    create: "Добавить",
    cancel: "Отмена",
    empty: "Сотрудников пока нет",
    emptyDesc: "Добавьте своего первого сотрудника.",
    loadError: "Не удалось загрузить данные",
    emailTaken: "Этот email уже занят",
    phoneTaken: "Этот номер телефона уже занят",
    genericError: "Произошла ошибка",
    need2fa: "Для работы с сотрудниками требуется включённая 2FA.",
    created: "Сотрудник добавлен",
    roleUpdated: "Роль обновлена",
    inactive: "Неактивен",
    deactivate: "Деактивировать",
    confirmDeactivateTitle: "Деактивировать сотрудника?",
    confirmDeactivateDesc: "Это действие необратимо — сотрудник больше не сможет войти в систему.",
    deactivated: "Деактивирован",
  },
};

const ROLE_COLORS = ["#D4AF37", "#4C6FFF", "#2FBF71", "#9B5DE5", "#F5A623", "#00B4D8"];
function colorForRole(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return ROLE_COLORS[hash % ROLE_COLORS.length];
}

export function UsersPage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken, user } = useTenantAuth();
  const has2fa = Boolean(user?.totp_enabled);

  const [users, setUsers] = useState<TenantUserRow[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [roleId, setRoleId] = useState("");
  const [saving, setSaving] = useState(false);

  const [roleEditFor, setRoleEditFor] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<TenantUserRow | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  async function load() {
    if (!accessToken) return;
    setError(null);
    try {
      setUsers(await usersApi.listUsers(accessToken));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t.loadError);
      return;
    }
    try {
      setRoles(await rolesApi.listRoles(accessToken));
    } catch {
      // roles list is only needed for the role picker -- users still render without it
    }
  }

  useEffect(() => {
    if (accessToken) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function handleCreate() {
    if (!accessToken) return;
    setSaving(true);
    try {
      await usersApi.createUser(accessToken, {
        email: email.trim(),
        password,
        role_id: roleId,
        phone: phone.trim() || undefined,
      });
      toast.success(t.created);
      setEmail("");
      setPassword("");
      setPhone("");
      setRoleId("");
      setFormOpen(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        toast.error(t.need2fa);
      } else if (err instanceof ApiError && err.status === 409 && err.detail.toLowerCase().includes("email")) {
        toast.error(t.emailTaken);
      } else if (err instanceof ApiError && err.status === 409) {
        toast.error(t.phoneTaken);
      } else {
        toast.error(t.genericError);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(userId: string, newRoleId: string) {
    if (!accessToken) return;
    try {
      await usersApi.updateUserRole(accessToken, userId, newRoleId);
      toast.success(t.roleUpdated);
      setRoleEditFor(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 403 ? t.need2fa : t.genericError);
    }
  }

  async function handleDeactivate() {
    if (!accessToken || !deactivateTarget) return;
    setDeactivating(true);
    try {
      await usersApi.deactivateUser(accessToken, deactivateTarget.id);
      toast.success(t.deactivated);
      setDeactivateTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 403 ? t.need2fa : t.genericError);
    } finally {
      setDeactivating(false);
    }
  }

  const canSubmit = email.trim().length > 0 && password.length >= 8 && roleId.length > 0;
  const sortedUsers = useMemo(() => {
    if (!users) return null;
    return [...users].sort((a, b) => Number(a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1));
  }, [users]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 sm:mb-8">
        <div>
          <h1 className="font-heading mb-1 text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
          <p className="text-sm text-foreground-muted">{t.sub}</p>
        </div>
        <Button variant="gold" onClick={() => setFormOpen((o) => !o)}>
          {formOpen ? <X size={16} /> : <Plus size={16} />}
          {t.add}
        </Button>
      </div>

      {formOpen && (
        <div className="glass-card mb-6 p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t.email} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ali@company.com" />
            <div>
              <FormField
                label={t.password}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
              />
              <PasswordStrengthMeter password={password} />
            </div>
            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">{t.role}</label>
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className="border-card-border bg-input-background text-foreground focus-visible:border-ring focus-visible:ring-ring/15 h-11 w-full rounded-xl border px-3.5 text-sm outline-none focus-visible:ring-[3px]"
              >
                <option value="">—</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <FormField label={t.phone} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" />
          </div>
          <div className="mt-2 flex gap-3">
            <Button variant="gold" disabled={!canSubmit || saving} onClick={handleCreate}>
              {saving && <Loader2 size={16} className="animate-spin" />}
              {t.create}
            </Button>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              {t.cancel}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center">
          <AlertCircle size={28} className="text-destructive" />
          <p className="text-sm text-foreground-muted">{error}</p>
        </div>
      )}

      {!error && sortedUsers === null && (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="text-primary animate-spin" />
        </div>
      )}

      {!error && sortedUsers !== null && sortedUsers.length === 0 && (
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center sm:p-14">
          <Users size={32} className="text-foreground-muted" />
          <h2 className="font-heading text-lg font-bold text-foreground">{t.empty}</h2>
          <p className="max-w-md text-sm text-foreground-muted">{t.emptyDesc}</p>
        </div>
      )}

      {!error && sortedUsers !== null && sortedUsers.length > 0 && (
        <div className="glass-card overflow-hidden p-0">
          {sortedUsers.map((u, i) => {
            const label = (u.email ?? u.phone ?? "?")[0]?.toUpperCase() ?? "?";
            const color = colorForRole(u.role_name);
            return (
              <div
                key={u.id}
                className={`flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 ${
                  i < sortedUsers.length - 1 ? "border-b border-card-border/60" : ""
                } ${!u.is_active ? "opacity-50" : ""}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="bg-accent flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-foreground-muted">
                    {label}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{u.email ?? u.phone}</div>
                    {u.email && u.phone && <div className="font-mono truncate text-xs text-foreground-muted">{u.phone}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!u.is_active && (
                    <span className="border-destructive/25 bg-destructive/10 text-destructive rounded-full border px-2.5 py-1 text-[11px] font-semibold">
                      {t.inactive}
                    </span>
                  )}
                  <div className="relative">
                    <button
                      onClick={() => setRoleEditFor(roleEditFor === u.id ? null : u.id)}
                      className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                      style={{ background: `${color}15`, borderColor: `${color}30`, color }}
                    >
                      {u.role_name}
                    </button>
                    {roleEditFor === u.id && (
                      <div className="glass-card absolute right-0 top-full z-10 mt-1 w-44 p-1.5">
                        {roles.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => handleRoleChange(u.id, r.id)}
                            className="hover:bg-accent w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium text-foreground"
                          >
                            {r.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {u.is_active && (
                    <button
                      onClick={() => setDeactivateTarget(u)}
                      className="text-destructive border-destructive/25 bg-destructive/10 flex size-8 items-center justify-center rounded-lg border"
                      aria-label={t.deactivate}
                    >
                      <UserX size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={deactivateTarget !== null}
        title={t.confirmDeactivateTitle}
        description={t.confirmDeactivateDesc}
        confirmLabel={t.deactivate}
        cancelLabel={t.cancel}
        destructive
        loading={deactivating}
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivateTarget(null)}
      />

      {!has2fa && (
        <p className="mt-6 text-center text-xs text-foreground-muted">{t.need2fa}</p>
      )}
    </main>
  );
}
