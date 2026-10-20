"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { translate as translateI18n } from "@/i18n";
import type { UserRole } from "@/types/user";

export interface UserManagementFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  roleFilter: UserRole | "ALL";
  onRoleFilterChange: (value: UserRole | "ALL") => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
}

export function UserManagementFilters({
  search,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  statusFilter,
  onStatusFilterChange,
}: UserManagementFiltersProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
      {/* Search Input */}
      <div className="sm:col-span-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={translateI18n("userPage.searchPlaceholder")}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
          aria-label={translateI18n("userPage.searchPlaceholder")}
        />
      </div>

      {/* Role Filter Dropdown */}
      <div className="sm:col-span-3">
        <select
          value={roleFilter}
          onChange={(e) => onRoleFilterChange(e.target.value as UserRole | "ALL")}
          aria-label={translateI18n("users.allRoles")}
          className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="ALL">{translateI18n("users.allRoles")}</option>
          <option value="SUPER_ADMIN">{translateI18n("role.SUPER_ADMIN")}</option>
          <option value="SALES">{translateI18n("role.SALES")}</option>
          <option value="HEAD_SA">{translateI18n("role.HEAD_SA")}</option>
          <option value="SA">{translateI18n("role.SA")}</option>
        </select>
      </div>

      {/* Status Filter Dropdown */}
      <div className="sm:col-span-3">
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          aria-label={translateI18n("users.allStatuses")}
          className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">{translateI18n("users.allStatuses")}</option>
          <option value="true">{translateI18n("copy.activeOnly")}</option>
          <option value="false">{translateI18n("ui.inactiveOnly")}</option>
        </select>
      </div>
    </div>
  );
}
