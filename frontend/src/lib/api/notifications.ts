import { apiFetch } from "./client";

export interface TelegramStatus {
  configured: boolean;
  bot_username?: string | null;
}

export interface GroupMapping {
  id: string;
  tenant_id: string;
  category_id: string | null;
  telegram_chat_id: number;
  label: string;
  is_active: boolean;
  created_at: string;
  resolved_title?: string | null;
}

export interface OutboxMessage {
  id: string;
  tenant_id: string;
  channel: string;
  telegram_chat_id: number;
  text_body: string | null;
  document_object_key: string | null;
  document_filename: string | null;
  category_id: string | null;
  status: "pending" | "sent" | "failed" | "dead_letter";
  retry_count: number;
  max_retries: number;
  next_attempt_at: string;
  last_error: string | null;
  created_by_user_id: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface DeliveryLogEntry {
  id: string;
  tenant_id: string;
  outbox_id: string;
  attempt_number: number;
  status: string;
  error: string | null;
  attempted_at: string;
}

export function configureTelegramBot(accessToken: string, botToken: string) {
  return apiFetch<TelegramStatus>("/api/v1/notifications/integrations/telegram", {
    method: "POST",
    accessToken,
    body: { bot_token: botToken },
  });
}

export function getTelegramStatus(accessToken: string) {
  return apiFetch<TelegramStatus>("/api/v1/notifications/integrations/telegram", { accessToken });
}

// Only one bot can ever exist per tenant -- "change" is re-calling
// configureTelegramBot (it upserts), this is "remove with no replacement".
export function disconnectTelegramBot(accessToken: string) {
  return apiFetch<TelegramStatus>("/api/v1/notifications/integrations/telegram", { method: "DELETE", accessToken });
}

export interface TelegramLinkToken {
  deep_link: string;
  expires_at: string;
}

// Self-service: no permission needed beyond being logged in -- every employee
// generates their own personal Telegram deep link (client requirement,
// 2026-07-11: each employee's own report should reach them individually via
// Telegram, not just a shared group).
export function createTelegramLinkToken(accessToken: string) {
  return apiFetch<TelegramLinkToken>("/api/v1/notifications/telegram/link-token", { method: "POST", accessToken });
}

// "Guruhga qo'shish" button -- Telegram's own ?startgroup=<token> deep link
// prompts the admin to pick a group to add the bot to; the chat_id is
// auto-discovered server-side (see telegram_link_worker.py), never typed in.
export function createGroupLinkToken(accessToken: string, body: { category_id?: string; label: string }) {
  return apiFetch<TelegramLinkToken>("/api/v1/notifications/group-mappings/link-token", {
    method: "POST",
    accessToken,
    body,
  });
}

export function createGroupMapping(
  accessToken: string,
  body: { category_id?: string; telegram_chat_id: number; label: string },
) {
  return apiFetch<GroupMapping>("/api/v1/notifications/group-mappings", { method: "POST", accessToken, body });
}

export function listGroupMappings(accessToken: string) {
  return apiFetch<GroupMapping[]>("/api/v1/notifications/group-mappings", { accessToken });
}

export function updateGroupMapping(accessToken: string, id: string, body: { label?: string; category_id?: string | null }) {
  return apiFetch<GroupMapping>(`/api/v1/notifications/group-mappings/${id}`, { method: "PATCH", accessToken, body });
}

export function deactivateGroupMapping(accessToken: string, id: string) {
  return apiFetch<void>(`/api/v1/notifications/group-mappings/${id}/deactivate`, { method: "PATCH", accessToken });
}

// Real hard delete, in addition to deactivate above -- backend rejects with
// 409 if a schedule still targets this group.
export function deleteGroupMapping(accessToken: string, id: string) {
  return apiFetch<void>(`/api/v1/notifications/group-mappings/${id}`, { method: "DELETE", accessToken });
}

export function sendMessage(
  accessToken: string,
  body: { category_id?: string; group_mapping_id?: string; text: string },
) {
  return apiFetch<OutboxMessage>("/api/v1/notifications/messages", { method: "POST", accessToken, body });
}

export function sendSalesSummaryReport(
  accessToken: string,
  body: { category_id?: string; period_start: string; period_end: string },
) {
  return apiFetch<OutboxMessage>("/api/v1/notifications/reports/sales-summary", { method: "POST", accessToken, body });
}

export function sendSellerKpiReport(
  accessToken: string,
  body: { seller_user_id: string; period_start: string; period_end: string },
) {
  return apiFetch<OutboxMessage>("/api/v1/notifications/reports/seller-kpi", { method: "POST", accessToken, body });
}

export function listMessages(accessToken: string) {
  return apiFetch<OutboxMessage[]>("/api/v1/notifications/messages", { accessToken });
}

export function listDeliveryLog(accessToken: string, outboxId?: string) {
  const query = outboxId ? `?outbox_id=${outboxId}` : "";
  return apiFetch<DeliveryLogEntry[]>(`/api/v1/notifications/delivery-log${query}`, { accessToken });
}

export type ScheduleContentType = "leaderboard" | "seller_kpis" | "custom_text";
export type SchedulePeriod = "today" | "week" | "month";

export interface NotificationSchedule {
  id: string;
  tenant_id: string;
  label: string;
  send_time: string; // "HH:MM:SS"
  days_of_week: number[] | null; // 0=Mon..6=Sun, null = every day
  is_enabled: boolean;
  last_sent_date: string | null;
  group_mapping_id: string | null;
  content_type: ScheduleContentType;
  period: SchedulePeriod;
  custom_text: string | null;
  user_ids: string[] | null;
  role_ids: string[] | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduleUpsertBody {
  label?: string;
  send_time: string;
  days_of_week?: number[] | null;
  is_enabled: boolean;
  group_mapping_id?: string;
  content_type: ScheduleContentType;
  period: SchedulePeriod;
  custom_text?: string | null;
  user_ids?: string[];
  role_ids?: string[];
}

// A tenant can run several independent recurring sends -- each with its own
// group/time/day-of-week filter/targeting/content (auto-generated team
// leaderboard, a single seller's KPI digest, or fixed text). Dispatched by a
// Celery-beat-driven task, not an in-process poll loop.
export function listSchedules(accessToken: string) {
  return apiFetch<NotificationSchedule[]>("/api/v1/notifications/schedules", { accessToken });
}

export function createSchedule(accessToken: string, body: ScheduleUpsertBody) {
  return apiFetch<NotificationSchedule>("/api/v1/notifications/schedules", { method: "POST", accessToken, body });
}

export function updateSchedule(accessToken: string, id: string, body: ScheduleUpsertBody) {
  return apiFetch<NotificationSchedule>(`/api/v1/notifications/schedules/${id}`, {
    method: "PATCH",
    accessToken,
    body,
  });
}

export function deleteSchedule(accessToken: string, id: string) {
  return apiFetch<void>(`/api/v1/notifications/schedules/${id}`, { method: "DELETE", accessToken });
}
