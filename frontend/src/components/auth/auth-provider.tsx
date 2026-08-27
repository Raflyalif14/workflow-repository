"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { supabase } from "@/lib/supabase";
import { User } from "@/types/user";

type LoginInput = { email: string; password: string };
type AuthContextValue = { user: User | null; isLoading: boolean; isAuthenticated: boolean; login: (input: LoginInput) => Promise<void>; logout: () => Promise<void> };
const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const PUBLIC_PATHS = ["/login"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isPublicPath = PUBLIC_PATHS.includes(pathname);

  const loadProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setUser(null); setIsLoading(false); return; }
    try { setUser(await apiClient<User>("/auth/me")); } catch { await supabase.auth.signOut(); setUser(null); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => {
    void loadProfile();
    const { data } = supabase.auth.onAuthStateChange(() => void loadProfile());
    return () => data.subscription.unsubscribe();
  }, [loadProfile]);
  useEffect(() => { if (!isLoading && !isPublicPath && !user) router.replace(`/login?next=${encodeURIComponent(pathname || "/")}`); }, [isLoading, isPublicPath, pathname, router, user]);

  const login = useCallback(async (input: LoginInput) => {
    const { error } = await supabase.auth.signInWithPassword(input);
    if (error) throw new Error(error.message);
    setUser(await apiClient<User>("/auth/me"));
    queryClient.clear();
  }, [queryClient]);
  const logout = useCallback(async () => { try { await supabase.auth.signOut(); } finally { setUser(null); queryClient.clear(); router.replace("/login"); } }, [queryClient, router]);
  const value = useMemo(() => ({ user, isLoading, isAuthenticated: Boolean(user), login, logout }), [isLoading, login, logout, user]);
  const shouldBlock = !isPublicPath && (isLoading || !user);
  return <AuthContext.Provider value={value}>{shouldBlock ? <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Loading session...</div> : children}</AuthContext.Provider>;
}

export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error("useAuth must be used within AuthProvider"); return context; }
