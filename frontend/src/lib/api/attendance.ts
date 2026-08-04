import { apiFetch, type Paginated } from "./client";

export interface AttendanceRecord {
  id: string;
  tenant_id: string;
  user_id: string;
  check_in_at: string;
  check_out_at: string | null;
  source: "manual" | "api";
  created_at: string;
}

export function checkIn(accessToken: string) {
  return apiFetch<AttendanceRecord>("/api/v1/attendance/check-in", { method: "POST", accessToken });
}

export function checkOut(accessToken: string) {
  return apiFetch<AttendanceRecord>("/api/v1/attendance/check-out", { method: "POST", accessToken });
}

// 7 per page (2026-07-28) -- numbered pagination, not an unbounded list.
export const ATTENDANCE_PAGE_SIZE = 7;

export function listAttendance(accessToken: string, userId?: string, limit = ATTENDANCE_PAGE_SIZE, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (userId) params.set("user_id", userId);
  return apiFetch<Paginated<AttendanceRecord>>(`/api/v1/attendance?${params.toString()}`, { accessToken });
}
