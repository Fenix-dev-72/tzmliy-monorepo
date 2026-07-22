import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Loader2, UserCheck } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as attendanceApi from "@/lib/api/attendance";
import * as usersApi from "@/lib/api/users";
import { USERS_DROPDOWN_LIMIT } from "@/lib/api/users";
import type { TenantUserRow } from "@/lib/api/users";

// Real "who's currently checked in" widget (backend: attendance module,
// GET /api/v1/attendance tenant-wide already returns every open record --
// check_out_at IS NULL -- no dedicated endpoint needed, see
// AttendancePage.tsx's own myRecord lookup for the same pattern). Replaces
// the old ActivityPlaceholder ("Faoliyatlar" / "hali ishlab chiqilmoqda"),
// which was honest about there being no *unified* activity feed -- this
// widget doesn't need one, it's scoped to attendance specifically.

const content = {
  uz: {
    title: "Faol xodimlar",
    seeAll: "Barchasini ko'rish",
    empty: "Hozir hech kim ishda emas",
    noPermission: "Bu bo'limni ko'rish uchun ruxsat yo'q",
    since: "dan beri",
  },
  ru: {
    title: "Активные сотрудники",
    seeAll: "Показать все",
    empty: "Сейчас никто не на работе",
    noPermission: "Нет доступа к этому разделу",
    since: "с",
  },
};

function elapsedSince(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function ActiveEmployeesCard() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken, user } = useTenantAuth();
  const canView = (user?.permissions ?? []).includes("attendance.view");

  const [users, setUsers] = useState<TenantUserRow[] | null>(null);
  const [openRecords, setOpenRecords] = useState<attendanceApi.AttendanceRecord[] | null>(null);

  useEffect(() => {
    if (!accessToken || !canView) return;
    Promise.all([attendanceApi.listAttendance(accessToken), usersApi.listUsers(accessToken, USERS_DROPDOWN_LIMIT)])
      .then(([records, usersData]) => {
        setOpenRecords(records.filter((r) => r.check_out_at === null));
        setUsers(usersData);
      })
      .catch(() => {
        setOpenRecords([]);
        setUsers([]);
      });
  }, [accessToken, canView]);

  const usersById = new Map((users ?? []).map((u) => [u.id, u]));
  const active = (openRecords ?? [])
    .slice()
    .sort((a, b) => new Date(b.check_in_at).getTime() - new Date(a.check_in_at).getTime());

  return (
    <div className="glass-card card-hover-lift auth-card-enter p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UserCheck size={18} className="text-primary shrink-0" />
          <h3 className="text-sm font-semibold text-foreground">{t.title}</h3>
        </div>
        <Link to="/dashboard/attendance" className="text-primary text-xs font-semibold whitespace-nowrap">
          {t.seeAll}
        </Link>
      </div>

      {!canView && <p className="py-6 text-center text-sm text-foreground-muted">{t.noPermission}</p>}

      {canView && openRecords === null && (
        <div className="flex justify-center py-6">
          <Loader2 size={20} className="text-primary animate-spin" />
        </div>
      )}

      {canView && openRecords !== null && active.length === 0 && (
        <p className="py-6 text-center text-sm text-foreground-muted">{t.empty}</p>
      )}

      {canView && openRecords !== null && active.length > 0 && (
        <div className="space-y-1">
          {active.map((r) => {
            const u = usersById.get(r.user_id);
            const name = u?.full_name ?? u?.email ?? u?.phone ?? r.user_id.slice(0, 8);
            return (
              <div key={r.id} className="flex items-center gap-3 rounded-xl px-1 py-2">
                <div className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                  {initials(name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{name}</div>
                  <div className="text-foreground-muted text-[11px]">
                    {t.since} {new Date(r.check_in_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <span className="text-success bg-success/10 shrink-0 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold">
                  {elapsedSince(r.check_in_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
