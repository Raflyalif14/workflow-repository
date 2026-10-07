import { User, UserRole } from "@/types/user";
import { translate } from "@/i18n";

const ACCESS_TOKEN_KEY = "workflow.accessToken";
const REFRESH_TOKEN_KEY = "workflow.refreshToken";
export const AUTH_SESSION_KEY = "workflow.session";
const AUTH_CLEARED_EVENT = "workflow-auth-cleared";
const FORCED_PASSWORD_EVENT = "workflow-forced-password";

const roles: UserRole[] = ["SUPER_ADMIN", "SALES", "HEAD_SA", "SA"];

type AuthStorageInput = {
  accessToken: string;
  refreshToken?: string | null;
};
export type AuthSession = AuthStorageInput & { id: string };

type RawUser = Partial<User> & {
  full_name?: unknown;
  role?: unknown;
  is_active?: unknown;
  must_change_password?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  preferred_language?: unknown;
};

const readString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const readBoolean = (value: unknown, fallback = false) =>
  typeof value === "boolean" ? value : fallback;

export function getAccessToken() {
  return getAuthSession()?.accessToken ?? null;
}

export function getAuthSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  const encoded = window.localStorage.getItem(AUTH_SESSION_KEY);
  if (encoded) {
    try {
      const value = JSON.parse(encoded);
      if (typeof value.id === "string" && typeof value.accessToken === "string" && value.accessToken) return {
        id: value.id, accessToken: value.accessToken, refreshToken: typeof value.refreshToken === "string" ? value.refreshToken : null,
      };
    } catch { /* An invalid local record is never a verified identity. */ }
    return null;
  }
  // One-time migration of existing credentials, without treating them as roles.
  const accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!accessToken) return null;
  setAuthTokens({ accessToken, refreshToken: window.localStorage.getItem(REFRESH_TOKEN_KEY) });
  return getAuthSession();
}

export function setAuthTokens(tokens: AuthStorageInput) {
  if (typeof window === "undefined") return;
  // A single storage write makes token rotation atomic across tabs.
  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ ...tokens, id: crypto.randomUUID() }));
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function isCurrentSession(session: AuthSession): boolean {
  return getAuthSession()?.id === session.id;
}

export function rotateAuthTokens(session: AuthSession, tokens: AuthStorageInput): boolean {
  const current = getAuthSession();
  if (!current || current.id !== session.id || current.accessToken !== session.accessToken) return false;
  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
    ...tokens, id: current.id, refreshToken: tokens.refreshToken || current.refreshToken,
  }));
  return true;
}

export function clearStoredAuth(options: { notify?: boolean } = {}) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_SESSION_KEY);
  if (options.notify !== false) {
    window.dispatchEvent(new Event(AUTH_CLEARED_EVENT));
  }
}

export function notifyForcedPasswordRequired() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FORCED_PASSWORD_EVENT));
}

export function onStoredAuthCleared(handler: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(AUTH_CLEARED_EVENT, handler);
  return () => window.removeEventListener(AUTH_CLEARED_EVENT, handler);
}

export function onForcedPasswordRequired(handler: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(FORCED_PASSWORD_EVENT, handler);
  return () => window.removeEventListener(FORCED_PASSWORD_EVENT, handler);
}

export function isForcedPasswordMessage(message?: string) {
  return Boolean(
    message &&
      message.toLowerCase().includes("must change your initial password")
  );
}

export function normalizeAuthUser(input: unknown): User {
  const raw = (input && typeof input === "object" ? input : {}) as RawUser;
  const role = roles.includes(raw.role as UserRole) ? (raw.role as UserRole) : "SA";

  return {
    id: readString(raw.id),
    email: readString(raw.email),
    fullName: readString(raw.fullName || raw.full_name),
    role,
    isActive: readBoolean(raw.isActive ?? raw.is_active, true),
    mustChangePassword: readBoolean(
      raw.mustChangePassword ?? raw.must_change_password,
      false
    ),
    preferredLanguage:
      (raw.preferredLanguage ?? raw.preferred_language) === "id" ? "id" : "en",
    phoneNumber: raw.phoneNumber,
    avatarUrl: raw.avatarUrl,
    createdAt: readString(raw.createdAt || raw.created_at),
    updatedAt: readString(raw.updatedAt || raw.updated_at, undefined),
    _count: raw._count,
  };
}

export function validatePasswordPolicyKey(password: string) {
  if (!password) return "auth.passwordRequired" as const;
  if (password !== password.trim()) {
    return "auth.passwordWhitespace" as const;
  }
  if (password.length < 12) return "auth.passwordLength" as const;
  if (!/[A-Z]/.test(password)) return "auth.passwordUppercase" as const;
  if (!/[a-z]/.test(password)) return "auth.passwordLowercase" as const;
  if (!/\d/.test(password)) return "auth.passwordNumber" as const;
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "auth.passwordSpecial" as const;
  }
  return null;
}

export function onAuthSessionChanged(handler: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const listener = (event: StorageEvent) => {
    if (event.key !== AUTH_SESSION_KEY && event.key !== null) return;
    if (event.storageArea && event.storageArea !== window.localStorage) return;
    if (event.key === null) { handler(); return; }
    const oldId = event.oldValue ? (() => { try { return JSON.parse(event.oldValue).id; } catch { return null; } })() : null;
    if (getAuthSession()?.id !== oldId) handler();
  };
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

export function validatePasswordPolicy(password: string) {
  const key = validatePasswordPolicyKey(password);
  return key ? translate(key) : null;
}

export const authRoutes = {
  public: ["/login", "/register", "/forgot-password", "/reset-password"],
  changePassword: "/change-password",
};
