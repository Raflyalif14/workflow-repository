"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient, authorizedFetch } from "@/lib/api-client";
import {
  authRoutes,
  clearStoredAuth,
  getAccessToken,
  normalizeAuthUser,
  onForcedPasswordRequired,
  onStoredAuthCleared,
  setAuthTokens,
} from "@/lib/auth";
import { User } from "@/types/user";

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
  login: (input: LoginInput) => Promise<User>;
  logout: () => Promise<void>;
  changeInitialPassword: (newPassword: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const isPublicPath = (pathname: string) =>
  authRoutes.public.some((path) => pathname === path || pathname.startsWith(`${path}/`));

const isAuthEntryPath = (pathname: string) => pathname === "/login";

function LoadingSession() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      Loading session...
    </div>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [passwordChangeCompleted, setPasswordChangeCompleted] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  const loadProfile = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setUser(null);
      setPasswordChangeCompleted(false);
      setIsLoading(false);
      return;
    }

    try {
      const profile = await apiClient<unknown>("/auth/me");
      setPasswordChangeCompleted(false);
      setUser(normalizeAuthUser(profile));
    } catch {
      clearStoredAuth();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const unsubscribeCleared = onStoredAuthCleared(() => {
      setUser(null);
      setPasswordChangeCompleted(false);
      queryClient.clear();
    });
    const unsubscribeForced = onForcedPasswordRequired(() => {
      if (pathname !== authRoutes.changePassword) {
        router.replace(authRoutes.changePassword);
      }
    });

    return () => {
      unsubscribeCleared();
      unsubscribeForced();
    };
  }, [pathname, queryClient, router]);

  useEffect(() => {
    if (isLoading) return;

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
  }, [isLoading, passwordChangeCompleted, pathname, router, user]);

  const login = useCallback(
    async (input: LoginInput) => {
      const result = await apiClient<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      });

      setAuthTokens({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });

      const nextUser = normalizeAuthUser(result.user);
      setPasswordChangeCompleted(false);
      setUser(nextUser);
      queryClient.clear();
      return nextUser;
    },
    [queryClient]
  );

  const logout = useCallback(async () => {
    try {
      if (getAccessToken()) {
        await authorizedFetch("/auth/logout", { method: "POST" });
      }
    } finally {
      clearStoredAuth({ notify: false });
      setUser(null);
      setPasswordChangeCompleted(false);
      queryClient.clear();
      router.replace("/login");
    }
  }, [queryClient, router]);

  const changeInitialPassword = useCallback(
    async (newPassword: string) => {
      await apiClient("/auth/change-initial-password", {
        method: "POST",
        body: JSON.stringify({ new_password: newPassword }),
      });
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
      login,
      logout,
      changeInitialPassword,
    }),
    [changeInitialPassword, isLoading, login, logout, user]
  );

  const canShowPasswordChangeSuccess =
    !user && pathname === authRoutes.changePassword && passwordChangeCompleted;
  const shouldBlock =
    isLoading ||
    (!user && !isPublicPath(pathname) && !canShowPasswordChangeSuccess) ||
    Boolean(user?.mustChangePassword && pathname !== authRoutes.changePassword && !isPublicPath(pathname));

  return (
    <AuthContext.Provider value={value}>
      {shouldBlock ? <LoadingSession /> : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
