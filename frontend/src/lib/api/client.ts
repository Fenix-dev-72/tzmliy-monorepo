const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  accessToken?: string | null;
  idempotencyKey?: string;
}

async function parseErrorDetail(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") return data.detail;
  } catch {
    // response wasn't JSON, fall through to generic message
  }
  return `Request failed with status ${res.status}`;
}

// Without this, a hung backend/proxy (or a dropped connection after a
// deploy/restart) left every page's loading state stuck true forever --
// fetch() never resolves or rejects on its own, so there was nothing for a
// page's try/catch to ever catch (found 2026-07-15: "every page gets stuck
// waiting to load, worst on Notifications" -- that page fires the most
// concurrent requests, so it was most likely to have one hang).
const REQUEST_TIMEOUT_MS = 20_000;

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, "So'rov vaqti tugadi -- internet aloqasini tekshiring");
    }
    throw new ApiError(0, "Serverga ulanib bo'lmadi");
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorDetail(res));
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

interface FormRequestOptions {
  accessToken?: string | null;
  form: FormData;
}

// Separate from apiFetch because a multipart body must NOT set
// Content-Type itself -- the browser has to append its own boundary, which
// only happens if the header is left unset entirely.
export async function apiFetchForm<T>(path: string, options: FormRequestOptions): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: options.form,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, "So'rov vaqti tugadi -- internet aloqasini tekshiring");
    }
    throw new ApiError(0, "Serverga ulanib bo'lmadi");
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorDetail(res));
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}
