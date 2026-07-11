import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as tenantAuthApi from "@/lib/api/tenantAuth";
import { ApiError } from "@/lib/api/client";
import { getPermissionsFromAccessToken } from "./jwt";
import type { LoginResult, TenantUser, TokenPair } from "./types";

const REFRESH_KEY = "tzmliy_tenant_refresh";

type Status = "anonymous" | "authenticating" | "authenticated";

interface TenantAuthContextValue {
  status: Status;
  accessToken: string | null;
  user: TenantUser | null;
  login(params: { identifier: string; password: string }): Promise<LoginResult>;
  completeLogin(tokens: TokenPair): Promise<void>;
  refreshSession(): Promise<void>;
  logout(): Promise<void>;
}

const TenantAuthContext = createContext<TenantAuthContextValue | null>(null);

export function TenantAuthProvider({ children }: { children: ReactNode }) {
  // Lazy-initialized so the very first render already reflects "a session
  // might still be restoring" -- otherwise a hard page reload briefly renders
  // status="anonymous" before the restore effect below has a chance to run,
  // and a protected route's own effect (which fires before this one, since
  // child effects run before parent effects) redirects to /login on that
  // false-negative frame.
  const [status, setStatus] = useState<Status>(() =>
    localStorage.getItem(REFRESH_KEY) ? "authenticating" : "anonymous",
  );
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<TenantUser | null>(null);

  const applyTokens = useCallback(async (tokens: TokenPair) => {
    localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
    setAccessToken(tokens.access_token);
    setStatus("authenticated");
    try {
      const me = await tenantAuthApi.me(tokens.access_token);
      // /auth/me doesn't return the permission set (it's only embedded in
      // the access token's `permissions` claim at issue time) -- decode it
      // client-side so nav/UI gating has something real to check against.
      setUser({ ...me, permissions: getPermissionsFromAccessToken(tokens.access_token) });
    } catch {
      // profile fetch failing shouldn't block the session — /auth/me can be retried by callers
    }
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    localStorage.removeItem(REFRESH_KEY);
    setAccessToken(null);
    setUser(null);
    setStatus("anonymous");
    if (refreshToken) {
      try {
        await tenantAuthApi.logout({ refresh_token: refreshToken });
      } catch {
        // best-effort — session is already cleared locally
      }
    }
  }, []);

  // Guard against React 18 StrictMode's double effect-invocation in dev --
  // otherwise two /auth/refresh calls fire back-to-back with the *same*
  // stored refresh token. Refresh tokens rotate on every use (single-use),
  // so the second call fails with an invalid-token error, and its catch
  // handler wipes localStorage and flips status to "anonymous" even though
  // the first call just established a perfectly valid session. Same class
  // of bug already fixed once in PlatformTwoFaSetupView's setup2fa call.
  const restoreRequested = useRef(false);
  useEffect(() => {
    const storedRefresh = localStorage.getItem(REFRESH_KEY);
    if (!storedRefresh || restoreRequested.current) return;
    restoreRequested.current = true;
    setStatus("authenticating");
    tenantAuthApi
      .refresh({ refresh_token: storedRefresh })
      .then((t) => applyTokens(t))
      .catch(() => {
        localStorage.removeItem(REFRESH_KEY);
        setStatus("anonymous");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-issues the token pair from the stored refresh token -- needed right
  // after confirm2fa, since totp_enabled is baked into the access token at
  // issue time and won't reflect the change until the next refresh.
  const refreshSession = useCallback(async () => {
    const storedRefresh = localStorage.getItem(REFRESH_KEY);
    if (!storedRefresh) return;
    const tokens = await tenantAuthApi.refresh({ refresh_token: storedRefresh });
    await applyTokens(tokens);
  }, [applyTokens]);

  const login = useCallback(
    async (params: { identifier: string; password: string }) => {
      const result = await tenantAuthApi.login(params);
      if (!result.requires_2fa) {
        await applyTokens(result);
      }
      return result;
    },
    [applyTokens],
  );

  const value = useMemo(
    () => ({ status, accessToken, user, login, completeLogin: applyTokens, refreshSession, logout }),
    [status, accessToken, user, login, applyTokens, refreshSession, logout],
  );

  return <TenantAuthContext.Provider value={value}>{children}</TenantAuthContext.Provider>;
}

export function useTenantAuth() {
  const ctx = useContext(TenantAuthContext);
  if (!ctx) throw new Error("useTenantAuth must be used within TenantAuthProvider");
  return ctx;
}

export { ApiError };
