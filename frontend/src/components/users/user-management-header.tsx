"use client";

import { UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { translate as translateI18n } from "@/i18n";

export interface UserManagementHeaderProps {
  onAddUser: () => void;
}

export function UserManagementHeader({ onAddUser }: UserManagementHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/50 pb-6">
      <div>
        <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider mb-1">
          <Users className="h-4 w-4" />
          <span>{translateI18n("copy.superAdminAccess")}</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {translateI18n("users.management")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {translateI18n("userPage.description")}
        </p>
      </div>

      <Button onClick={onAddUser} className="gap-2 self-start sm:self-auto shadow-md">
        <UserPlus className="h-4 w-4" />
        <span>{translateI18n("users.add")}</span>
      </Button>
    </div>
  );
}
