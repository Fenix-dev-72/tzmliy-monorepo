import { apiFetch } from "./client";

export interface BackupSettingsStatus {
  bot_configured: boolean;
  bot_username: string | null;
  configured: boolean;
  chat_id: number | null;
  link_pending: boolean;
  last_backup_at: string | null;
  last_backup_status: "success" | "failed" | null;
  last_backup_error: string | null;
}

export interface BackupLinkToken {
  deep_link: string;
  expires_at: string;
}

export function getBackupSettings(accessToken: string) {
  return apiFetch<BackupSettingsStatus>("/platform/v1/backup-settings", { accessToken });
}

export function setBackupBotToken(accessToken: string, params: { bot_token: string; reason: string }) {
  return apiFetch<BackupSettingsStatus>("/platform/v1/backup-settings/bot-token", {
    method: "PUT",
    accessToken,
    body: params,
  });
}

export function createBackupLinkToken(accessToken: string) {
  return apiFetch<BackupLinkToken>("/platform/v1/backup-settings/link-token", {
    method: "POST",
    accessToken,
  });
}

export function runBackupNow(accessToken: string) {
  return apiFetch<{ queued: boolean }>("/platform/v1/backup-settings/run-now", {
    method: "POST",
    accessToken,
  });
}
