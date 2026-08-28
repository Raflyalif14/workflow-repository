import { User, UserRole } from "@/types/user";

const ACCESS_TOKEN_KEY = "workflow.accessToken";
const REFRESH_TOKEN_KEY = "workflow.refreshToken";
const AUTH_CLEARED_EVENT = "workflow-auth-cleared";
const FORCED_PASSWORD_EVENT = "workflow-forced-password";

const roles: UserRole[] = ["SUPER_ADMIN", "SALES", "HEAD_SA", "SA"];

type AuthStorageInput = {
  accessToken: string;
  refreshToken?: string | null;
};

type RawUser = Partial<User> & {
  full_name?: unknown;
  role?: unknown;
  is_active?: unknown;
  must_change_password?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

const readString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const readBoolean = (value: unknown, fallback = false) =>
  typeof value === "boolean" ? value : fallback;

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAuthTokens(tokens: AuthStorageInput) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  if (tokens.refreshToken) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  } else {
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

export function clearStoredAuth(options: { notify?: boolean } = {}) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
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
    phoneNumber: raw.phoneNumber,
    avatarUrl: raw.avatarUrl,
    createdAt: readString(raw.createdAt || raw.created_at),
    updatedAt: readString(raw.updatedAt || raw.updated_at, undefined),
    _count: raw._count,
  };
}

export function validatePasswordPolicy(password: string) {
  if (!password) return "Password wajib diisi.";
  if (password !== password.trim()) {
    return "Password tidak boleh memiliki spasi di awal atau akhir.";
  }
  if (password.length < 12) return "Password minimal 12 karakter.";
  if (!/[A-Z]/.test(password)) return "Password harus memiliki huruf besar.";
  if (!/[a-z]/.test(password)) return "Password harus memiliki huruf kecil.";
  if (!/\d/.test(password)) return "Password harus memiliki angka.";
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password harus memiliki karakter spesial.";
  }
  return null;
}

export const authRoutes = {
  public: ["/login", "/register", "/forgot-password", "/reset-password"],
  changePassword: "/change-password",
};
