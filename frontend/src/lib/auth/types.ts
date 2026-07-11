export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export type LoginResult =
  | ({ requires_2fa: false } & TokenPair)
  | { requires_2fa: true; pending_token: string };

export interface TenantUser {
  id: string;
  email: string | null;
  phone: string | null;
  role_name: string;
  totp_enabled: boolean;
  permissions: string[];
}

export interface PlatformAdmin {
  id: string;
  email: string;
  totp_enabled: boolean;
}
