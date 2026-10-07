import {
  AuthSession, clearStoredAuth, getAuthSession, isCurrentSession, isForcedPasswordMessage,
  notifyForcedPasswordRequired, rotateAuthTokens,
} from "./auth";
import { translate } from "@/i18n";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
type ApiResponse<T> = { success: boolean; message: string; data?: T; errors?: { code?: string; [key: string]: unknown } | null };
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    const keys = { AUTH_UNAVAILABLE: "auth.sessionTemporary", AUTH_REFRESH_BUSY: "auth.sessionRateLimited", AUTH_REFRESH_INVALID: "auth.sessionExpired", AUTH_ACCOUNT_INACTIVE: "auth.sessionInactive", AUTH_REPLAY_REQUIRED: "auth.retryRequest" } as const;
    const key = keys[code as keyof typeof keys];
    super(key ? translate(key) : message);
  }
}
export class SessionChangedError extends Error { constructor() { super(translate("auth.sessionChanged")); } }

async function parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
  try { return await response.json(); }
  catch { return { success: response.ok, message: response.statusText || "Unexpected empty response" }; }
}

function headersFor(options: RequestInit, token?: string) {
  const headers = new Headers(options.headers);
  if (!(typeof FormData !== "undefined" && options.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-cache");
  headers.set("Pragma", "no-cache");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

const refreshExcluded = new Set(["/auth/login", "/auth/register", "/auth/forgot-password", "/auth/reset-password", "/auth/refresh", "/auth/logout"]);
const flights = new Map<string, Promise<AuthSession>>();
const invalidSession = (data: ApiResponse<unknown>) => ["AUTH_TOKEN_INVALID", "AUTH_ACCOUNT_INACTIVE", "AUTH_REFRESH_INVALID", "AUTH_REQUIRED"].includes(data.errors?.code || "");
const expiredAccess = (data: ApiResponse<unknown>) => data.errors?.code === "AUTH_TOKEN_INVALID";
function currentOrThrow(session: AuthSession): AuthSession {
  const current = getAuthSession();
  if (!current || current.id !== session.id) throw new SessionChangedError();
  return current;
}

async function performRefresh(session: AuthSession): Promise<AuthSession> {
  const current = currentOrThrow(session);
  if (current.accessToken !== session.accessToken) return current;
  if (!current.refreshToken) {
    clearStoredAuth();
    throw new ApiError("Your session has expired. Please sign in again.", 401, "AUTH_REFRESH_INVALID");
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });
  } catch {
    currentOrThrow(session);
    throw new ApiError("Authentication is temporarily unavailable. Please try again.", 503, "AUTH_UNAVAILABLE");
  }
  const data = await parseResponse<{ accessToken: string; refreshToken?: string | null }>(response);
  const latest = currentOrThrow(session);
  if (latest.accessToken !== current.accessToken) return latest;
  if (!response.ok) {
    if (response.status === 401 && invalidSession(data)) clearStoredAuth();
    throw new ApiError(data.message, response.status, data.errors?.code);
  }
  if (!data.data?.accessToken || typeof data.data.accessToken !== "string") throw new ApiError("Authentication is temporarily unavailable. Please try again.", 503, "AUTH_UNAVAILABLE");
  rotateAuthTokens(current, data.data);
  return currentOrThrow(session);
}

function refreshSession(session: AuthSession): Promise<AuthSession> {
  const existing = flights.get(session.id);
  if (existing) return existing;
  const operation = async () => performRefresh(session);
  // Shared localStorage can rotate in another tab. Native locks serialize that
  // short critical section; the session/token is rechecked after acquiring it.
  const pending = async (): Promise<AuthSession> => {
    if (typeof navigator !== "undefined" && navigator.locks) return await navigator.locks.request(`workflow-auth-refresh:${session.id}`, operation);
    return await operation();
  };
  const promise = pending().finally(() => { if (flights.get(session.id) === promise) flights.delete(session.id); });
  flights.set(session.id, promise);
  return promise;
}

export async function authorizedFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const session = getAuthSession();
  const request = (token?: string) => fetch(`${API_BASE_URL}${endpoint}`, {
    ...options, cache: options.cache ?? "no-store", headers: headersFor(options, token),
  });
  let response = await request(session?.accessToken);
  let endedSession = false;
  const excluded = refreshExcluded.has(endpoint.split("?")[0]);
  if (response.status === 401 && !excluded && session) {
    const data = await parseResponse<unknown>(response.clone());
    currentOrThrow(session);
    if (expiredAccess(data)) {
      const refreshed = await refreshSession(session);
      if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      // Streams cannot be replayed. FormData, strings, blobs and buffers can.
      if (typeof ReadableStream !== "undefined" && options.body instanceof ReadableStream) {
        throw new ApiError("Please retry the request.", 401, "AUTH_REPLAY_REQUIRED");
      }
      response = await request(refreshed.accessToken);
      if (response.status === 401) {
        const retry = await parseResponse<unknown>(response.clone());
        if (isCurrentSession(refreshed) && getAuthSession()?.accessToken === refreshed.accessToken && invalidSession(retry)) { clearStoredAuth(); endedSession = true; }
      }
    } else if (invalidSession(data)) { clearStoredAuth(); endedSession = true; }
  }
  if (session && !excluded && !endedSession && !isCurrentSession(session)) throw new SessionChangedError();
  if (response.status === 403) {
    const data = await parseResponse<unknown>(response.clone());
    if (isForcedPasswordMessage(data.message)) notifyForcedPasswordRequired();
  }
  return response;
}

export async function apiClient<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const session = getAuthSession();
  const response = await authorizedFetch(endpoint, options);
  const data = await parseResponse<T>(response);
  if (response.ok && session && !refreshExcluded.has(endpoint.split("?")[0]) && !isCurrentSession(session)) throw new SessionChangedError();
  if (!response.ok) throw new ApiError(data.message || "An unexpected error occurred", response.status, data.errors?.code);
  return data.data as T;
}
