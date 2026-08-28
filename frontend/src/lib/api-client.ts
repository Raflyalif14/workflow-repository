import {
  clearStoredAuth,
  getAccessToken,
  isForcedPasswordMessage,
  notifyForcedPasswordRequired,
} from "./auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

type ApiResponse<T> = {
  success: boolean;
  message: string;
  data?: T;
  errors?: {
    code?: string;
    [key: string]: unknown;
  } | null;
};

async function parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
  try {
    return await response.json();
  } catch {
    return {
      success: response.ok,
      message: response.statusText || "Unexpected empty response",
    };
  }
}

async function buildHeaders(options: RequestInit) {
  const token = getAccessToken();
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  return {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  } as HeadersInit;
}

export async function authorizedFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    cache: options.cache ?? "no-store",
    headers: await buildHeaders(options),
  });

  if (response.status === 401) {
    clearStoredAuth();
  }

  if (response.status === 403) {
    const data = await parseResponse<unknown>(response.clone());
    if (isForcedPasswordMessage(data.message)) {
      notifyForcedPasswordRequired();
    }
  }

  return response;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await authorizedFetch(endpoint, options);
  const data = await parseResponse<T>(response);

  if (!response.ok) {
    if (response.status === 401) {
      clearStoredAuth();
    }
    if (response.status === 403 && isForcedPasswordMessage(data.message)) {
      notifyForcedPasswordRequired();
    }
    throw new Error(data.message || "An unexpected error occurred");
  }

  return data.data as T;
}
