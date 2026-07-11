import { apiFetch } from "./client";

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

export function listAttendance(accessToken: string, userId?: string) {
  const query = userId ? `?user_id=${userId}` : "";
  return apiFetch<AttendanceRecord[]>(`/api/v1/attendance${query}`, { accessToken });
}
