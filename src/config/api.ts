// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api";

const getAuthToken = (): string | null => {
  return sessionStorage.getItem("auth_token");
};

type InFlightEntry = {
  promise: Promise<unknown>;
  expiresAt: number;
};

const inFlightGets = new Map<string, InFlightEntry>();
const GET_DEDUP_TTL_MS = 1500;

function clearExpiredGets() {
  const now = Date.now();
  for (const [key, entry] of inFlightGets) {
    if (entry.expiresAt <= now) inFlightGets.delete(key);
  }
}

/** Tenant-aware cache key so team switches never reuse another tenant's GET. */
function getCacheKey(url: string, token: string | null): string {
  const tenantHint = token ? token.slice(-16) : "anon";
  return `${tenantHint}::${url}`;
}

/** Drop cached GETs (e.g. after mutations, logout, or team switch). */
export function invalidateApiCache(prefix?: string) {
  if (!prefix) {
    inFlightGets.clear();
    return;
  }
  for (const key of inFlightGets.keys()) {
    if (key.includes(prefix) || key.endsWith(prefix) || key.includes(`::${prefix}`)) {
      inFlightGets.delete(key);
    }
  }
}

function clearSessionAndRedirectToLogin() {
  sessionStorage.removeItem("auth_token");
  invalidateApiCache();
  window.dispatchEvent(new Event("session-expired"));
  const path = window.location.pathname || "";
  if (!path.startsWith("/login") && !path.startsWith("/reset-password") && path !== "/") {
    const next = encodeURIComponent(path + window.location.search);
    window.location.assign(`/login?next=${next}`);
  }
}

// Base fetch wrapper with error handling, AbortSignal support, and short-TTL GET dedup
export const apiRequest = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const method = (options.method || "GET").toUpperCase();
  const token = getAuthToken();
  const url = `${API_BASE_URL}${endpoint}`;
  const cacheKey = getCacheKey(url, token);

  if (method === "GET" && !options.signal) {
    clearExpiredGets();
    const cached = inFlightGets.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.promise as Promise<T>;
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.headers) {
    const extra = new Headers(options.headers);
    extra.forEach((value, key) => {
      headers[key] = value;
    });
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const run = async (): Promise<T> => {
    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        method,
        headers,
      });
    } catch (networkErr) {
      if (networkErr instanceof DOMException && networkErr.name === "AbortError") {
        throw networkErr;
      }
      const msg =
        networkErr instanceof Error
          ? networkErr.message
          : "Network error";
      throw new Error(
        `${msg}. Request URL: ${url}. Check VITE_API_BASE_URL and CORS (backend must allow this origin).`
      );
    }

    if (response.status === 401) {
      clearSessionAndRedirectToLogin();
      throw new Error("Session expired. Please sign in again.");
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "An error occurred" }));
      throw new Error(error.message || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  };

  const promise = run();

  if (method === "GET" && !options.signal) {
    inFlightGets.set(cacheKey, {
      promise,
      expiresAt: Date.now() + GET_DEDUP_TTL_MS,
    });
    promise.catch(() => {
      inFlightGets.delete(cacheKey);
    });
  } else if (method !== "GET") {
    invalidateApiCache();
  }

  return promise;
};
