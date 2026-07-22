import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Loader2, LogIn, LogOut } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useTenantAuth } from "@/lib/auth/tenantAuthStore";
import * as attendanceApi from "@/lib/api/attendance";
import type { AttendanceRecord } from "@/lib/api/attendance";
import * as usersApi from "@/lib/api/users";
import { USERS_DROPDOWN_LIMIT } from "@/lib/api/users";
import type { TenantUserRow } from "@/lib/api/users";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

const content = {
  uz: {
    title: "Davomat",
    sub: "Ish vaqtini belgilash",
    checkIn: "Ishga keldim",
    checkOut: "Ishdan ketdim",
    working: "Hozir ishda",
    genericError: "Xatolik yuz berdi",
    checkedIn: "Ish boshlandi",
    checkedOut: "Ish tugadi",
    teamTitle: "Jamoa davomati",
    loadError: "Ma'lumotlarni yuklab bo'lmadi",
    empty: "Hali davomat yozuvlari yo'q",
    employee: "Xodim",
    checkInTime: "Kelgan",
    checkOutTime: "Ketgan",
    worked: "Ishlagan vaqt",
    inProgress: "Davom etmoqda",
  },
  ru: {
    title: "Посещаемость",
    sub: "Отметка рабочего времени",
    checkIn: "Пришёл на работу",
    checkOut: "Ушёл с работы",
    working: "Сейчас на работе",
    genericError: "Произошла ошибка",
    checkedIn: "Рабочий день начат",
    checkedOut: "Рабочий день окончен",
    teamTitle: "Посещаемость команды",
    loadError: "Не удалось загрузить данные",
    empty: "Записей посещаемости пока нет",
    employee: "Сотрудник",
    checkInTime: "Пришёл",
    checkOutTime: "Ушёл",
    worked: "Отработано",
    inProgress: "В процессе",
  },
};

function formatDuration(ms: number) {
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}${"h"} ${m}${"m"}`;
}

export function AttendancePage() {
  const { lang } = useLang();
  const t = content[lang];
  const { accessToken, user } = useTenantAuth();
  const canView = (user?.permissions ?? []).includes("attendance.view");

  const [myRecord, setMyRecord] = useState<AttendanceRecord | null>(null);
  const [myStatusKnown, setMyStatusKnown] = useState(false);
  const [toggling, setToggling] = useState(false);

  const [team, setTeam] = useState<AttendanceRecord[] | null>(null);
  const [users, setUsers] = useState<TenantUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !user) return;
    (async () => {
      try {
        const own = await attendanceApi.listAttendance(accessToken, user.id);
        const open = own.find((r) => r.check_out_at === null) ?? null;
        setMyRecord(open);
      } catch {
        // no attendance.view -- initial state unknown, button defaults to check-in
      } finally {
        setMyStatusKnown(true);
      }

      if (canView) {
        try {
          const [teamData, usersData] = await Promise.all([
            attendanceApi.listAttendance(accessToken),
            usersApi.listUsers(accessToken, USERS_DROPDOWN_LIMIT),
          ]);
          setTeam(teamData);
          setUsers(usersData);
        } catch (err) {
          setError(err instanceof ApiError ? err.detail : t.loadError);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, user?.id]);

  async function handleToggle() {
    if (!accessToken) return;
    setToggling(true);
    try {
      if (myRecord) {
        await attendanceApi.checkOut(accessToken);
        setMyRecord(null);
        toast.success(t.checkedOut);
      } else {
        const record = await attendanceApi.checkIn(accessToken);
        setMyRecord(record);
        toast.success(t.checkedIn);
      }
      if (canView && accessToken) {
        attendanceApi.listAttendance(accessToken).then(setTeam).catch(() => {});
      }
    } catch {
      toast.error(t.genericError);
    } finally {
      setToggling(false);
    }
  }

  const usersById = new Map(users.map((u) => [u.id, u]));

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <h1 className="font-heading mb-1 text-xl font-extrabold text-foreground sm:text-2xl">{t.title}</h1>
        <p className="text-sm text-foreground-muted">{t.sub}</p>
      </div>

      <div className="glass-card mb-8 flex flex-col items-center gap-4 p-8 text-center sm:p-10">
        {myRecord && (
          <span className="text-success flex items-center gap-1.5 text-xs font-bold tracking-wide">
            <span className="bg-success size-1.5 animate-pulse rounded-full" />
            {t.working}
          </span>
        )}
        <Button
          variant={myRecord ? "outline" : "gold"}
          size="lg"
          disabled={!myStatusKnown || toggling}
          onClick={handleToggle}
          className="min-w-[220px]"
        >
          {toggling ? (
            <Loader2 size={18} className="animate-spin" />
          ) : myRecord ? (
            <LogOut size={18} />
          ) : (
            <LogIn size={18} />
          )}
          {myRecord ? t.checkOut : t.checkIn}
        </Button>
      </div>

      {canView && (
        <>
          <h2 className="font-heading mb-4 text-base font-bold text-foreground">{t.teamTitle}</h2>

          {error && (
            <div className="glass-card flex flex-col items-center gap-3 p-10 text-center">
              <AlertCircle size={28} className="text-destructive" />
              <p className="text-sm text-foreground-muted">{error}</p>
            </div>
          )}

          {!error && team === null && (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="text-primary animate-spin" />
            </div>
          )}

          {!error && team !== null && team.length === 0 && (
            <p className="glass-card py-10 text-center text-sm text-foreground-muted">{t.empty}</p>
          )}

          {!error && team !== null && team.length > 0 && (
            <div className="glass-card overflow-hidden p-0">
              {team.map((r, i) => {
                const worked = r.check_out_at
                  ? formatDuration(new Date(r.check_out_at).getTime() - new Date(r.check_in_at).getTime())
                  : null;
                return (
                  <div
                    key={r.id}
                    className={`flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 ${
                      i < team.length - 1 ? "border-b border-card-border/60" : ""
                    }`}
                  >
                    <span className="text-sm font-semibold text-foreground">
                      {usersById.get(r.user_id)?.full_name ??
                        usersById.get(r.user_id)?.email ??
                        usersById.get(r.user_id)?.phone ??
                        r.user_id.slice(0, 8)}
                    </span>
                    <div className="flex items-center gap-4 text-xs text-foreground-muted">
                      <span>
                        {t.checkInTime}: {new Date(r.check_in_at).toLocaleString()}
                      </span>
                      <span>
                        {t.checkOutTime}: {r.check_out_at ? new Date(r.check_out_at).toLocaleString() : "—"}
                      </span>
                      <span className="font-mono text-foreground">{worked ?? t.inProgress}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </main>
  );
}
