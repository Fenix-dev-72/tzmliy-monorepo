import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as platformAuthApi from "@/lib/api/platformAuth";
import { getTokenExpiryMs } from "./jwt";
import type { LoginResult, TokenPair } from "./types";

const REFRESH_KEY = "tzmliy_platform_refresh";
// Mirrors tenantAuthStore.tsx's REFRESH_LEAD_MS -- same 15min access token
// TTL (platform_access_token_ttl_minutes), same background-tab-throttling
// fix (2026-07-17).
const REFRESH_LEAD_MS = 60_000;

type Status = "anonymous" | "authenticating" | "authenticated";

interface PlatformAuthContextValue {
  status: Status;
  accessToken: string | null;
  totpEnabled: boolean;
  login(params: { email: string; password: string }): Promise<LoginResult>;
  completeLogin(tokens: TokenPair): void;
  setup2fa(): Promise<{ secret: string; otpauth_uri: string }>;
  confirm2fa(code: string): Promise<void>;
  logout(): Promise<void>;
}

const PlatformAuthContext = createContext<PlatformAuthContextValue | null>(null);

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("anonymous");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [totpEnabled, setTotpEnabled] = useState(false);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const performSilentRefreshRef = useRef<() => Promise<void>>(async () => {});

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleRefresh = useCallback(
    (token: string) => {
      clearRefreshTimer();
      const expiryMs = getTokenExpiryMs(token);
      if (expiryMs === null) return;
      const delay = Math.max(expiryMs - Date.now() - REFRESH_LEAD_MS, 0);
      refreshTimerRef.current = setTimeout(() => {
        performSilentRefreshRef.current();
      }, delay);
    },
    [clearRefreshTimer],
  );

  // Platform access tokens carry no totp_enabled claim (unlike tenant tokens) — the backend
  // enforces 2FA by checking the DB directly on privileged endpoints. So totpEnabled here is
  // tracked from which auth step actually succeeded, never decoded from the token itself.
  const applyTokens = useCallback(
    (tokens: TokenPair) => {
      localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
      scheduleRefresh(tokens.access_token);
      setAccessToken(tokens.access_token);
      setStatus("authenticated");
    },
    [scheduleRefresh],
  );

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    localStorage.removeItem(REFRESH_KEY);
    clearRefreshTimer();
    setAccessToken(null);
    setTotpEnabled(false);
    setStatus("anonymous");
    if (refreshToken) {
      try {
        await platformAuthApi.logout({ refresh_token: refreshToken });
      } catch {
        // best-effort — session is already cleared locally
      }
    }
  }, [clearRefreshTimer]);

  // Silent background refresh, same rationale as tenantAuthStore.tsx's
  // performSilentRefresh -- swallows errors and just logs out quietly on a
  // genuinely dead refresh token, since this runs from a timer/visibility
  // handler with no page-level try/catch to report to.
  const performSilentRefresh = useCallback(async () => {
    const storedRefresh = localStorage.getItem(REFRESH_KEY);
    if (!storedRefresh) return;
    try {
      const tokens = await platformAuthApi.refresh({ refresh_token: storedRefresh });
      applyTokens(tokens);
      setTotpEnabled(true);
    } catch {
      localStorage.removeItem(REFRESH_KEY);
      clearRefreshTimer();
      setAccessToken(null);
      setTotpEnabled(false);
      setStatus("anonymous");
    }
  }, [applyTokens, clearRefreshTimer]);

  useEffect(() => {
    performSilentRefreshRef.current = performSilentRefresh;
  }, [performSilentRefresh]);

  // Browsers throttle/suspend setTimeout in background tabs -- forces a
  // check the moment the tab becomes visible again (2026-07-17, mirrors the
  // same fix in tenantAuthStore.tsx).
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible" || !accessToken) return;
      const expiryMs = getTokenExpiryMs(accessToken);
      if (expiryMs === null || expiryMs - Date.now() < REFRESH_LEAD_MS) {
        performSilentRefreshRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [accessToken]);

  useEffect(() => {
    const storedRefresh = localStorage.getItem(REFRESH_KEY);
    if (!storedRefresh) return;
    setStatus("authenticating");
    platformAuthApi
      .refresh({ refresh_token: storedRefresh })
      .then((tokens) => {
        applyTokens(tokens);
        // A persisted session implies 2FA was already completed in an earlier visit — optimistic,
        // but the only signal we have; a genuinely unconfigured account will just 403 on privileged
        // calls, same as the backend's own enforcement point.
        setTotpEnabled(true);
      })
      .catch(() => {
        localStorage.removeItem(REFRESH_KEY);
        setStatus("anonymous");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (params: { email: string; password: string }) => {
      const result = await platformAuthApi.login(params);
      if (!result.requires_2fa) {
        // The backend only skips the 2FA prompt when the account has no TOTP configured yet.
        applyTokens(result);
        setTotpEnabled(false);
      }
      return result;
    },
    [applyTokens],
  );

  const completeLogin = useCallback(
    (tokens: TokenPair) => {
      // Only reached via the pending_token 2FA-verify flow, which only exists because the
      // account already has TOTP enabled — so this is always a true signal.
      applyTokens(tokens);
      setTotpEnabled(true);
    },
    [applyTokens],
  );

  const setup2fa = useCallback(() => {
    if (!accessToken) throw new Error("Not authenticated");
    return platformAuthApi.setup2fa(accessToken);
  }, [accessToken]);

  const confirm2fa = useCallback(
    async (code: string) => {
      if (!accessToken) throw new Error("Not authenticated");
      await platformAuthApi.confirm2fa(accessToken, { code });
      setTotpEnabled(true);
      const storedRefresh = localStorage.getItem(REFRESH_KEY);
      if (storedRefresh) {
        const tokens = await platformAuthApi.refresh({ refresh_token: storedRefresh });
        applyTokens(tokens);
      }
    },
    [accessToken, applyTokens],
  );

  const value = useMemo(
    () => ({ status, accessToken, totpEnabled, login, completeLogin, setup2fa, confirm2fa, logout }),
    [status, accessToken, totpEnabled, login, completeLogin, setup2fa, confirm2fa, logout],
  );

  return <PlatformAuthContext.Provider value={value}>{children}</PlatformAuthContext.Provider>;
}

export function usePlatformAuth() {
  const ctx = useContext(PlatformAuthContext);
  if (!ctx) throw new Error("usePlatformAuth must be used within PlatformAuthProvider");
  return ctx;
}
