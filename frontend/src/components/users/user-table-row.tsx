"use client";

import { Pencil, Power } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getIntlLocale, translate as translateI18n } from "@/i18n";
import type { User } from "@/types/user";
import { UserRoleBadge } from "./user-role-badge";

export interface UserTableRowProps {
  user: User;
  onEdit: (user: User) => void;
  onToggleStatus: (user: User) => void;
  isStatusUpdating?: boolean;
  isCurrentUser?: boolean;
}

export function UserTableRow({
  user,
  onEdit,
  onToggleStatus,
  isStatusUpdating = false,
  isCurrentUser = false,
}: UserTableRowProps) {
  const initials = (user.fullName || user.email || "?")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <tr className="hover:bg-muted/20 transition-colors">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs uppercase">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-foreground truncate">{user.fullName}</span>
              {isCurrentUser && (
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-primary/30 text-primary bg-primary/5">
                  {translateI18n("userPage.you")}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground truncate">{user.email}</div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <UserRoleBadge role={user.role} />
      </td>
      <td className="px-6 py-4">
        <Badge
          variant={user.isActive ? "success" : "destructive"}
          className="text-[10px]"
        >
          {translateI18n(user.isActive ? "common.active" : "common.inactive")}
        </Badge>
      </td>
      <td className="px-6 py-4 text-xs text-muted-foreground whitespace-nowrap">
        {new Date(user.createdAt).toLocaleDateString(getIntlLocale())}
      </td>
      <td className="px-6 py-4 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title={translateI18n("userPage.edit")}
            onClick={() => onEdit(user)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          {isCurrentUser ? (
            <span
              className="inline-flex h-8 items-center px-2 text-[11px] font-medium text-muted-foreground/60 italic"
              title={translateI18n("userPage.cannotDeactivateSelf")}
            >
              {translateI18n("userPage.currentUser")}
            </span>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 transition-colors ${
                user.isActive
                  ? "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400 dark:hover:text-emerald-300"
              }`}
              title={translateI18n(user.isActive ? "userPage.deactivate" : "userPage.activate")}
              disabled={isStatusUpdating}
              onClick={() => onToggleStatus(user)}
            >
              <Power className="h-4 w-4" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
