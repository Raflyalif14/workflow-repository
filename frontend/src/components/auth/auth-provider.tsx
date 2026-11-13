"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient, authorizedFetch } from "@/lib/api-client";
import {
  authRoutes,
  clearStoredAuth,
  getAccessToken,
  getAuthSession,
  isCurrentSession,
  onAuthSessionChanged,
  normalizeAuthUser,
  onForcedPasswordRequired,
  onStoredAuthCleared,
  setAuthTokens,
} from "@/lib/auth";
import { startSessionActivity } from "@/lib/session-activity";
import { User } from "@/types/user";
import { translate } from "@/i18n";
import { loadVerifiedProfileWithRetry, profileBlocksProtectedUi } from "@/lib/auth-profile";

type LoginInput = { email: string; password: string };
type LoginResponse = {
  user: unknown;
  accessToken: string;
  refreshToken?: string | null;
};
type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  profileError: "temporary" | "forbidden" | null;
  retryProfile: () => Promise<void>;
  login: (input: LoginInput) => Promise<User>;
  completeFaceLogin: (result: LoginResponse) => void;
  logout: () => Promise<void>;
  changeInitialPassword: (newPassword: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const isPublicPath = (pathname: string) =>
  authRoutes.public.some((path) => pathname === path || pathname.startsWith(`${path}/`));

const isAuthEntryPath = (pathname: string) => pathname === "/login";

function LoadingSession({ reconnecting = false }: { reconnecting?: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 text-center text-sm text-muted-foreground" role="status">
      {translate(reconnecting ? "auth.reconnecting" : "common.loading")}
    </div>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [passwordChangeCompleted, setPasswordChangeCompleted] = useState(false);
  const [profileError, setProfileError] = useState<"temporary" | "forbidden" | null>(null);
  const operation = useRef(0);
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  const loadProfile = useCallback(async () => {
    const generation = ++operation.current;
    const session = getAuthSession();
    if (!session) {
      setUser(null);
      setProfileError(null);
      setPasswordChangeCompleted(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const result = await loadVerifiedProfileWithRetry(session, () => generation === operation.current);
    if (generation !== operation.current) return;
    if (result.kind === "verified") {
      setPasswordChangeCompleted(false);
      setUser(result.user);
      setProfileError(null);
    } else if (result.kind === "temporary" && isCurrentSession(session)) {
      setProfileError("temporary");
    } else if ((result.kind === "invalid" || result.kind === "forbidden") && isCurrentSession(session)) {
      clearStoredAuth();
      setUser(null);
      setProfileError(null);
      setPasswordChangeCompleted(false);
      queryClient.clear();
    }
    setIsLoading(false);
  }, [queryClient]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (profileError !== "temporary" || isLoading) return;

    let retrying = false;
    const retry = () => {
      if (retrying) return;
      retrying = true;
      void loadProfile();
    };
    const timer = setTimeout(retry, 10_000);
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
    };
  }, [isLoading, loadProfile, profileError]);

  useEffect(() => {
    const unsubscribeCleared = onStoredAuthCleared(() => {
      ++operation.current;
      setUser(null);
      setProfileError(null);
      setIsLoading(false);
      setPasswordChangeCompleted(false);
      queryClient.clear();
    });
    const unsubscribeChanged = onAuthSessionChanged(() => {
      ++operation.current;
      setUser(null);
      setProfileError(null);
      setIsLoading(true);
      queryClient.clear();
      void loadProfile();
    });
    const unsubscribeForced = onForcedPasswordRequired(() => {
      if (pathname !== authRoutes.changePassword) {
        router.replace(authRoutes.changePassword);
      }
    });

    return () => {
      unsubscribeCleared();
      unsubscribeChanged();
      unsubscribeForced();
    };
  }, [loadProfile, pathname, queryClient, router]);

  useEffect(() => {
    if (isLoading || profileError) return;

    const publicPath = isPublicPath(pathname);
    const changePasswordPath = pathname === authRoutes.changePassword;

    if (!user && !publicPath) {
      if (changePasswordPath && passwordChangeCompleted) return;
      router.replace(`/login?next=${encodeURIComponent(pathname || "/")}`);
      return;
    }

    if (!user) return;

    if (user.mustChangePassword) {
      if (isAuthEntryPath(pathname) || (!publicPath && !changePasswordPath)) {
        router.replace(authRoutes.changePassword);
      }
      return;
    }

    if (isAuthEntryPath(pathname) || changePasswordPath) {
      router.replace("/");
    }
  }, [isLoading, profileError, passwordChangeCompleted, pathname, router, user]);

  const login = useCallback(
    async (input: LoginInput) => {
      clearStoredAuth();
      const generation = ++operation.current;
      const result = await apiClient<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      });
      if (operation.current !== generation) throw new Error(translate("auth.sessionChanged"));

      setAuthTokens({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });

      const nextUser = normalizeAuthUser(result.user);
      setProfileError(null);
      setIsLoading(false);
      setPasswordChangeCompleted(false);
      setUser(nextUser);
      queryClient.clear();
      return nextUser;
    },
    [queryClient]
  );

  const completeFaceLogin = useCallback((result: LoginResponse) => {
    if (getAuthSession() || user) throw new Error(translate("auth.sessionChanged"));
    const nextUser = normalizeAuthUser(result.user);
    if (!result.accessToken || !result.refreshToken || !nextUser.isActive || nextUser.mustChangePassword) throw new Error(translate("auth.loginError"));
    ++operation.current;
    setAuthTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    setProfileError(null); setIsLoading(false); setPasswordChangeCompleted(false); setUser(nextUser); queryClient.clear();
  }, [queryClient, user]);

  const logout = useCallback(async () => {
    const token = getAccessToken();
    ++operation.current;
    clearStoredAuth({ notify: false });
    setUser(null);
    setProfileError(null);
    setIsLoading(false);
    setPasswordChangeCompleted(false);
    queryClient.clear();
    router.replace("/login");
    try {
      if (token) {
        await authorizedFetch("/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      }
    } catch { /* Local logout is complete even if the provider is unavailable. */ }
  }, [queryClient, router]);

  const activityUserId = user?.id;
  const mustChangePassword = user?.mustChangePassword;
  const sessionId = user ? getAuthSession()?.id : undefined;
  useEffect(() => {
    if (!activityUserId || mustChangePassword || !sessionId) return;
    const session = getAuthSession();
    if (!session || session.id !== sessionId) return;
    let active = true;
    const stop = startSessionActivity({
      sessionId,
      isCurrent: () => active && isCurrentSession(session),
      onExpired: () => { void logout(); },
      keepAlive: async () => {
        const result = await loadVerifiedProfileWithRetry(session, () => active && isCurrentSession(session));
        if (!active || !isCurrentSession(session)) return;
        if (result.kind === 'verified') setUser(result.user);
        else if (result.kind === 'invalid' || result.kind === 'forbidden') { void logout(); }
        // A temporary network failure does not log out a verified, active user.
      },
    });
    return () => { active=false; stop(); };
  }, [sessionId, activityUserId, mustChangePassword, logout]);

  const changeInitialPassword = useCallback(
    async (newPassword: string) => {
      const session = getAuthSession();
      await apiClient("/auth/change-initial-password", {
        method: "POST",
        body: JSON.stringify({ new_password: newPassword }),
      });
      if (!session || !isCurrentSession(session)) return;
      ++operation.current;
      clearStoredAuth({ notify: false });
      setUser(null);
      setPasswordChangeCompleted(true);
      queryClient.clear();
    },
    [queryClient]
  );

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      profileError,
      retryProfile: loadProfile,
      login,
      completeFaceLogin,
      logout,
      changeInitialPassword,
    }),
    [changeInitialPassword, completeFaceLogin, isLoading, loadProfile, login, logout, profileError, user]
  );

  const canShowPasswordChangeSuccess =
    !user && pathname === authRoutes.changePassword && passwordChangeCompleted;
  const shouldBlock =
    (isLoading && !user) ||
    (profileBlocksProtectedUi(Boolean(user), profileError) && !isPublicPath(pathname) && !canShowPasswordChangeSuccess) ||
    Boolean(user?.mustChangePassword && pathname !== authRoutes.changePassword && !isPublicPath(pathname));

  return (
    <AuthContext.Provider value={value}>
      {shouldBlock ? <LoadingSession reconnecting={profileError === "temporary"} /> : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
