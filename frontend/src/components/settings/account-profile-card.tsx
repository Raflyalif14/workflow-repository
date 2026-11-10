"use client";

import { CheckCircle2, Shield, ShieldCheck, User as UserIcon } from "lucide-react";
import { User } from "@/types/user";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/components/i18n/language-provider";
import { formatActorRoleLabel } from "@/lib/workflow-ux-helpers";
import type { TranslationKey } from "@/i18n";

export function getUserInitials(name?: string): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

interface AccountProfileCardProps {
  user: User | null;
}

export function AccountProfileCard({ user }: AccountProfileCardProps) {
  const { t, formatDate } = useLanguage();

  if (!user) return null;

  const roleDescKey = `accountProfile.roleDesc_${user.role}` as TranslationKey;
  const initials = getUserInitials(user.fullName);

  return (
    <Card className="overflow-hidden border-border/70 shadow-sm" data-testid="account-profile-card">
      <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              {t("accountProfile.title")}
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              {t("accountProfile.description")}
            </CardDescription>
          </div>
          <Badge variant="success" className="gap-1.5 px-2.5 py-1 text-xs font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
            {t("accountProfile.active")}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-5">
        {/* Main Identity Banner */}
        <div className="flex items-center gap-4">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-deep text-lg font-bold text-primary-foreground shadow-md">
            {initials}
            <span
              className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-card ring-2 ring-border"
              title={t("accountProfile.active")}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
            </span>
          </div>

          <div className="min-w-0 space-y-1">
            <h2 className="truncate text-lg font-bold text-foreground">
              {user.fullName || t("nav.userAccount")}
            </h2>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary text-[11px] font-medium">
                {formatActorRoleLabel(user.role)}
              </Badge>
              {user.createdAt && (
                <span className="text-[11px] text-muted-foreground">
                  {t("accountProfile.memberSince")} {formatDate(user.createdAt, { dateStyle: "medium" })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Info Grid (2 balanced columns) */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Role info */}
          <div className="rounded-xl border border-border/60 bg-card p-3.5 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Shield className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span>{t("accountProfile.role")}</span>
            </div>
            <p className="text-sm font-semibold text-foreground">{formatActorRoleLabel(user.role)}</p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t(roleDescKey)}
            </p>
          </div>

          {/* Current Session */}
          <div className="rounded-xl border border-border/60 bg-card p-3.5 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <UserIcon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span>{t("accountProfile.sessionActive")}</span>
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <p className="text-sm font-semibold text-foreground">{t("accountProfile.active")}</p>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t("accountProfile.sessionActiveHelp")}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
