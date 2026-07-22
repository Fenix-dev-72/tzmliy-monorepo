import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as tenantAuthApi from "@/lib/api/tenantAuth";
import { ApiError } from "@/lib/api/client";
import { getPermissionsFromAccessToken, getTokenExpiryMs } from "./jwt";
import type { LoginResult, TenantUser, TokenPair } from "./types";

const REFRESH_KEY = "tzmliy_tenant_refresh";
// Refresh this long before the access token's real expiry (15min TTL,
// see backend/app/core/config.py's access_token_ttl_minutes) so a timer
// that fires a little late from background-tab throttling still beats it.
const REFRESH_LEAD_MS = 60_000;

type Status = "anonymous" | "authenticating" | "authenticated";

interface TenantAuthContextValue {
  status: Status;
  accessToken: string | null;
  user: TenantUser | null;
  login(params: { identifier: string; password: string }): Promise<LoginResult>;
  completeLogin(tokens: TokenPair): Promise<void>;
  refreshSession(): Promise<void>;
  refetchUser(): Promise<void>;
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

  // Access tokens are short-lived (15min) and in-memory only (see CLAUDE.md),
  // with nothing that retries a 401 -- without a proactive refresh, a tab
  // left open (or just backgrounded) silently sits on an expired token until
  // the user does a hard reload, at which point every in-flight action
  // (e.g. the CRM webhook-url fetch, "Ulash" configure calls) fails with a
  // generic error. refreshTimerRef schedules a refresh shortly before expiry;
  // the visibilitychange handler below covers the case where the browser
  // throttled/suspended that timer while the tab was hidden.
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

  const applyTokens = useCallback(async (tokens: TokenPair) => {
    localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
    scheduleRefresh(tokens.access_token);
    // /auth/me is fetched BEFORE setAccessToken/setUser run, and both of
    // those are set together, in the same tick -- not accessToken first
    // and user in a later setState after the await resolves. Getting this
    // order backwards (as it was before 2026-07-15) opens a real render
    // frame where accessToken is truthy but user is still null: every
    // dashboard page's useEffect(() => load(), [accessToken]) fires right
    // then, load() reads a permission off `user` (e.g. canView), sees it
    // false, and bails out immediately -- then never retries, because user
    // becoming available afterwards doesn't rerun an effect keyed only on
    // accessToken. That's what caused pages (worst on Notifications, which
    // gates the most sections this way) to get stuck on an empty/loading
    // state forever after a hard refresh, since session restore always
    // goes through this same function.
    try {
      const me = await tenantAuthApi.me(tokens.access_token);
      // /auth/me doesn't return the permission set (it's only embedded in
      // the access token's `permissions` claim at issue time) -- decode it
      // client-side so nav/UI gating has something real to check against.
      setAccessToken(tokens.access_token);
      setStatus("authenticated");
      setUser({ ...me, permissions: getPermissionsFromAccessToken(tokens.access_token) });
    } catch {
      // profile fetch failing shouldn't block the session -- /auth/me can
      // be retried by callers (refetchUser), just without a batched user
      // update here.
      setAccessToken(tokens.access_token);
      setStatus("authenticated");
    }
  }, [scheduleRefresh]);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    localStorage.removeItem(REFRESH_KEY);
    clearRefreshTimer();
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
  }, [clearRefreshTimer]);

  // Silent background refresh -- used by both the pre-expiry timer and the
  // visibility handler below. Swallows errors (unlike the public
  // refreshSession, which callers like TwoFactorSettingsPage need to
  // surface): a stale/expired refresh token here just means the session is
  // genuinely over, so it logs out quietly rather than throwing into
  // whatever page happened to be mounted at the time.
  const performSilentRefresh = useCallback(async () => {
    const storedRefresh = localStorage.getItem(REFRESH_KEY);
    if (!storedRefresh) return;
    try {
      const tokens = await tenantAuthApi.refresh({ refresh_token: storedRefresh });
      await applyTokens(tokens);
    } catch {
      localStorage.removeItem(REFRESH_KEY);
      clearRefreshTimer();
      setAccessToken(null);
      setUser(null);
      setStatus("anonymous");
    }
  }, [applyTokens, clearRefreshTimer]);

  useEffect(() => {
    performSilentRefreshRef.current = performSilentRefresh;
  }, [performSilentRefresh]);

  // Browsers throttle/suspend setTimeout in background tabs, so the
  // scheduled pre-expiry refresh above can't be relied on alone -- this
  // catches the case (reported 2026-07-17: switching tabs, then coming back
  // to a dead session until a hard reload) by forcing a check the moment the
  // tab becomes visible again.
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

  // Re-reads /auth/me on the *current* access token -- unlike refreshSession,
  // this never touches the refresh token, so it's safe to call repeatedly
  // (e.g. polling for pending_links to clear after a self-service link
  // completes) without tripping the single-use refresh-token rotation.
  const refetchUser = useCallback(async () => {
    if (!accessToken) return;
    const me = await tenantAuthApi.me(accessToken);
    setUser({ ...me, permissions: getPermissionsFromAccessToken(accessToken) });
  }, [accessToken]);

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
    () => ({ status, accessToken, user, login, completeLogin: applyTokens, refreshSession, refetchUser, logout }),
    [status, accessToken, user, login, applyTokens, refreshSession, refetchUser, logout],
  );

  return <TenantAuthContext.Provider value={value}>{children}</TenantAuthContext.Provider>;
}

export function useTenantAuth() {
  const ctx = useContext(TenantAuthContext);
  if (!ctx) throw new Error("useTenantAuth must be used within TenantAuthProvider");
  return ctx;
}

export { ApiError };
