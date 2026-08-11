export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export type LoginResult =
  | ({ requires_2fa: false } & TokenPair)
  | { requires_2fa: true; pending_token: string; resend_after_seconds: number };

export type PendingLink = "telegram" | "utel" | "crm";

export interface TenantUser {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  role_name: string;
  totp_enabled: boolean;
  permissions: string[];
  // The tenant's own subdomain ({tenant_slug}.tizimly.uz) -- null only if
  // somehow missing on an old/malformed tenant row (shouldn't happen).
  tenant_slug: string | null;
  // Self-service integration links this user still needs to complete
  // (client requirement, 2026-07-13) -- empty means fully onboarded.
  pending_links: PendingLink[];
}

export interface PlatformAdmin {
  id: string;
  email: string;
  totp_enabled: boolean;
}
