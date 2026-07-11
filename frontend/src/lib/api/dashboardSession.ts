import { apiFetch, ApiError } from "./client";
import type { LeaderboardEntry, CategorySalesEntry } from "./analytics";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export function dashboardLogin(params: { tenant_slug: string; name: string; password: string }) {
  return apiFetch<{ access_token: string; token_type: string }>("/api/v1/dashboard-sessions/login", {
    method: "POST",
    body: params,
  });
}

export function getLeaderboard(accessToken: string) {
  return apiFetch<LeaderboardEntry[]>("/api/v1/dashboard-sessions/leaderboard", { accessToken });
}

export function getCourseSales(accessToken: string) {
  return apiFetch<CategorySalesEntry[]>("/api/v1/dashboard-sessions/course-sales", { accessToken });
}

export { ApiError };

/** Same hand-parsed SSE pattern as `analytics.ts`'s `subscribeLeaderboard` --
 * `EventSource` can't send a custom Authorization header. */
export function subscribeLeaderboard(
  accessToken: string,
  onEntries: (entries: LeaderboardEntry[]) => void,
  onError?: () => void,
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/v1/dashboard-sessions/leaderboard/stream`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error("stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try {
            onEntries(JSON.parse(line.slice(5).trim()) as LeaderboardEntry[]);
          } catch {
            // malformed frame -- skip it, the next tick will self-correct
          }
        }
      }
    } catch {
      if (!controller.signal.aborted) onError?.();
    }
  })();

  return () => controller.abort();
}
