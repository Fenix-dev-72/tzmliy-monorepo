import { apiFetch } from "./client";

export interface TelegramStatus {
  configured: boolean;
}

export interface GroupMapping {
  id: string;
  tenant_id: string;
  category_id: string | null;
  telegram_chat_id: number;
  label: string;
  is_active: boolean;
  created_at: string;
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

export function createGroupMapping(
  accessToken: string,
  body: { category_id?: string; telegram_chat_id: number; label: string },
) {
  return apiFetch<GroupMapping>("/api/v1/notifications/group-mappings", { method: "POST", accessToken, body });
}

export function listGroupMappings(accessToken: string) {
  return apiFetch<GroupMapping[]>("/api/v1/notifications/group-mappings", { accessToken });
}

export function sendMessage(accessToken: string, body: { category_id?: string; text: string }) {
  return apiFetch<OutboxMessage>("/api/v1/notifications/messages", { method: "POST", accessToken, body });
}

export function sendSalesSummaryReport(
  accessToken: string,
  body: { category_id?: string; period_start: string; period_end: string },
) {
  return apiFetch<OutboxMessage>("/api/v1/notifications/reports/sales-summary", { method: "POST", accessToken, body });
}

export function listMessages(accessToken: string) {
  return apiFetch<OutboxMessage[]>("/api/v1/notifications/messages", { accessToken });
}

export function listDeliveryLog(accessToken: string, outboxId?: string) {
  const query = outboxId ? `?outbox_id=${outboxId}` : "";
  return apiFetch<DeliveryLogEntry[]>(`/api/v1/notifications/delivery-log${query}`, { accessToken });
}
