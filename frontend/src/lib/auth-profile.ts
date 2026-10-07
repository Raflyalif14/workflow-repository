import { apiClient, ApiError, SessionChangedError } from "./api-client";
import { AuthSession, isCurrentSession, normalizeAuthUser } from "./auth";
import { User } from "@/types/user";

export type ProfileResult = { kind: "verified"; user: User } | { kind: "stale" | "invalid" | "temporary" | "forbidden" };
export async function loadVerifiedProfile(session: AuthSession): Promise<ProfileResult> {
  try {
    const profile = await apiClient<unknown>("/auth/me");
    if (!isCurrentSession(session)) return { kind: "stale" };
    const user = normalizeAuthUser(profile);
    if (!user.isActive) return { kind: "invalid" };
    if (!user.id || !profile || typeof profile !== "object" || !["SA", "SALES", "HEAD_SA", "SUPER_ADMIN"].includes((profile as { role: string }).role)) return { kind: "temporary" };
    const raw = profile as { isActive?: unknown; is_active?: unknown };
    if (typeof (raw.isActive ?? raw.is_active) !== "boolean") return { kind: "temporary" };
    return { kind: "verified", user };
  } catch (error) {
    if (error instanceof SessionChangedError || (error instanceof Error && error.name === "AbortError")) return { kind: "stale" };
    if (!isCurrentSession(session)) return { kind: "stale" };
    if (error instanceof ApiError && error.status === 401 && ["AUTH_ACCOUNT_INACTIVE", "AUTH_REFRESH_INVALID", "AUTH_REQUIRED", "AUTH_TOKEN_INVALID"].includes(error.code || "")) return { kind: "invalid" };
    return { kind: error instanceof ApiError && error.status === 403 ? "forbidden" : "temporary" };
  }
}

export function profileBlocksProtectedUi(hasVerifiedUser: boolean, error: "temporary" | "forbidden" | null): boolean {
  return !hasVerifiedUser || error === "forbidden";
}
