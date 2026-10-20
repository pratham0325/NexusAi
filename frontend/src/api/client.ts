/**
 * Typed API client for the NexusAI Express backend. All responses use the
 * { success, data } / { success, error } envelope.
 *
 * Session strategy:
 * 1. httpOnly cookies (primary) — works whenever the browser allows the API's
 *    cookies in the current context.
 * 2. Bearer access token (fallback) — preview iframes often block third-party
 *    cookies entirely (Chrome's third-party-cookie phase-out, Safari ITP), so
 *    auth responses also return a short-lived access token which is kept in
 *    sessionStorage and sent as `Authorization: Bearer …`.
 * 3. The long-lived refresh token lives ONLY in an httpOnly cookie; it is
 *    never readable by scripts or kept in browser storage.
 *
 * Expired access tokens transparently refresh once, then replay the request.
 */
import axios, {
  type AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

interface RetryConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

const ACCESS_KEY = "nexusai.access";
/** Legacy key from builds that mirrored the refresh token; purged on load. */
const LEGACY_REFRESH_KEY = "nexusai.refresh";

try {
  localStorage.removeItem(LEGACY_REFRESH_KEY);
} catch {
  // storage unavailable
}

/* ─── Token store (short-lived access token in sessionStorage) ───────── */

export const tokenStore = {
  get access(): string | null {
    try {
      return sessionStorage.getItem(ACCESS_KEY);
    } catch {
      return null;
    }
  },
  set(access: string | null): void {
    try {
      if (access) sessionStorage.setItem(ACCESS_KEY, access);
      else sessionStorage.removeItem(ACCESS_KEY);
    } catch {
      // storage unavailable (private mode) — cookie-only mode continues
    }
  },
  clear(): void {
    this.set(null);
  },
};

/* ─── Interceptors ───────────────────────────────────────────────────── */

api.interceptors.request.use((config) => {
  const access = tokenStore.access;
  if (access) {
    config.headers.set?.("Authorization", `Bearer ${access}`);
  }
  return config;
});

let refreshing: Promise<boolean> | null = null;

/** Try to rotate the session once; resolves false if refresh fails. */
function refreshSession(): Promise<boolean> {
  refreshing ??= api
    .post("/auth/refresh")
    .then((res) => {
      captureAuthTokens(res.data?.data);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined;
    if (
      error.response?.status === 401 &&
      config &&
      !config._retried &&
      !config.url?.includes("/auth/refresh") &&
      !config.url?.includes("/auth/logout")
    ) {
      config._retried = true;
      if (await refreshSession()) {
        return api.request(config);
      }
    }
    return Promise.reject(error);
  },
);

/** Capture tokens from any auth response and remember the session. */
export function captureAuthTokens(payload: unknown): void {
  if (!payload || typeof payload !== "object") return;
  const data = payload as { accessToken?: unknown };
  if (typeof data.accessToken === "string" && data.accessToken) {
    tokenStore.set(data.accessToken);
  }
}

/** Unwraps the envelope; throws Error with the server message on failure. */
export async function unwrap<T>(
  promise: Promise<AxiosResponse<ApiEnvelope<T>>>,
): Promise<T> {
  try {
    const res = await promise;
    captureAuthTokens(res.data?.data);
    return res.data.data as T;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const payload = err.response?.data as ApiEnvelope<unknown> | undefined;
      throw new Error(payload?.error?.message ?? err.message);
    }
    throw err;
  }
}

/** Absolute origin for SSE fetches (e.g. http://localhost:5000). */
export function apiOrigin(): string {
  const baseURL = api.defaults.baseURL ?? "/api";
  if (baseURL.startsWith("http")) {
    return baseURL.replace(/\/api\/?$/, "");
  }
  return window.location.origin;
}
