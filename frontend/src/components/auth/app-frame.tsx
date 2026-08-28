"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { authRoutes } from "@/lib/auth";

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage =
    authRoutes.public.includes(pathname) || pathname === authRoutes.changePassword;

  if (isAuthPage) {
    return <main className="min-h-screen bg-background">{children}</main>;
  }

  return <AppShell>{children}</AppShell>;
}
