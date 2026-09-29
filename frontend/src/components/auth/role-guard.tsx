"use client";

import React from "react";
import { useAuth } from "./auth-provider";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";

interface RoleGuardProps {
  allowedRoles: string[];
  children: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { user, isLoading } = useAuth();
  const { t } = useLanguage();

  if (isLoading) {
    return (
      <div className="flex py-20 items-center justify-center text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  if (user?.mustChangePassword) {
    return (
      <div className="flex py-20 items-center justify-center text-sm text-muted-foreground">
        {t("ui.redirectingPassword")}
      </div>
    );
  }

  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <div className="container py-20 text-center space-y-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/15 text-destructive mx-auto border border-destructive/30">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <div className="space-y-1 max-w-md mx-auto">
          <h2 className="text-xl font-bold text-foreground">{t("ui.accessRestricted")}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("ui.roleNoPermission", { role: user?.role?.replace(/_/g, " ") || t("role.GUEST") })}
          </p>
        </div>
        <Link href="/">
          <Button variant="outline" className="gap-2 mt-2">
            {t("common.back")}
          </Button>
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
