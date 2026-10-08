"use client";
import { useLanguage } from "@/components/i18n/language-provider";

import { translate as translateI18n, getIntlLocale } from "@/i18n";

import React, { useState } from "react";
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Pencil,
  Power,
  ChevronLeft,
  ChevronRight,
  Shield,
  Briefcase,
  Layers,
  Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useUsers, useUpdateUserStatus } from "@/hooks/use-users";
import { User, UserRole } from "@/types/user";
import { UserFormDialog } from "@/components/users/user-form-dialog";

import { RoleGuard } from "@/components/auth/role-guard";

export default function UsersPage() {
  useLanguage();
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN"]}>
      <UsersPageContent />
    </RoleGuard>
  );
}

function UsersPageContent() {
  const [page, setPage] = useState(1);
  const [limit] = useState(8);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Dialog States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<User | null>(null);


  const { data, isLoading, isError } = useUsers({
    page,
    limit,
    search,
    role: roleFilter,
    isActive: statusFilter,
  });
  const updateStatus = useUpdateUserStatus();

  const users = data?.users || [];
  const pagination = data?.pagination || {
    page: 1,
    limit: 8,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case "SUPER_ADMIN":
        return (
          <Badge className="bg-primary-soft text-primary border border-primary/20 gap-1">
            <Shield className="h-3 w-3" />
            <span>{translateI18n("role.SUPER_ADMIN")}</span>
          </Badge>
        );
      case "SALES":
        return (
          <Badge className="bg-blue-500/15 text-primary border border-blue-500/30 gap-1">
            <Briefcase className="h-3 w-3" />
            <span>{translateI18n("role.SALES")}</span>
          </Badge>
        );
      case "HEAD_SA":
        return (
          <Badge className="bg-amber-500/15 text-warning border border-amber-500/30 gap-1">
            <Layers className="h-3 w-3" />
            <span>{translateI18n("role.HEAD_SA")}</span>
          </Badge>
        );
      case "SA":
        return (
          <Badge className="bg-emerald-500/15 text-success border border-emerald-500/30 gap-1">
            <Code2 className="h-3 w-3" />
            <span>{translateI18n("role.SA")}</span>
          </Badge>
        );
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  const handleOpenCreate = () => {
    setSelectedUserForEdit(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (user: User) => {
    setSelectedUserForEdit(user);
    setIsFormOpen(true);
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] min-w-0 space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/50 pb-6">
        <div>
          <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider mb-1">
            <Users className="h-4 w-4" />
            <span>{translateI18n("copy.superAdminAccess")}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{translateI18n("users.management")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {translateI18n("userPage.description")}
          </p>
        </div>

        <Button onClick={handleOpenCreate} className="gap-2 self-start sm:self-auto shadow-md">
          <UserPlus className="h-4 w-4" />
          <span>{translateI18n("users.add")}</span>
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        {/* Search */}
        <div className="sm:col-span-6 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={translateI18n("userPage.searchPlaceholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>

        {/* Filter Role */}
        <div className="sm:col-span-3">
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value as any);
              setPage(1);
            }}
            className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="ALL">{translateI18n("users.allRoles")}</option>
            <option value="SUPER_ADMIN">{translateI18n("role.SUPER_ADMIN")}</option>
            <option value="SALES">{translateI18n("role.SALES")}</option>
            <option value="HEAD_SA">{translateI18n("role.HEAD_SA")}</option>
            <option value="SA">{translateI18n("role.SA")}</option>
          </select>
        </div>

        {/* Filter Status */}
        <div className="sm:col-span-3">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">{translateI18n("users.allStatuses")}</option>
            <option value="true">{translateI18n("copy.activeOnly")}</option>
            <option value="false">{translateI18n("ui.inactiveOnly")}</option>
          </select>
        </div>
      </div>

      {/* Table Card */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 border-b border-border text-xs uppercase font-semibold text-muted-foreground">
              <tr>
                <th className="px-6 py-4">{translateI18n("copy.user")}</th>
                <th className="px-6 py-4">{translateI18n("copy.role")}</th>
                <th className="px-6 py-4">{translateI18n("common.status")}</th>
                <th className="px-6 py-4">{translateI18n("users.createdAt")}</th>
                <th className="px-6 py-4 text-right">{translateI18n("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    {translateI18n("userPage.loading")}
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-destructive">
                    {translateI18n("userPage.loadFailed")}
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    {translateI18n("userPage.empty")}
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs uppercase">
                          {user.fullName.slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{user.fullName}</div>
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">{getRoleBadge(user.role)}</td>
                    <td className="px-6 py-4">
                      <Badge
                        variant={user.isActive ? "success" : "destructive"}
                        className="text-[10px]"
                      >
                        {translateI18n(user.isActive ? "common.active" : "common.inactive")}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString(getIntlLocale())}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title={translateI18n("userPage.edit")}
                          onClick={() => handleOpenEdit(user)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title={translateI18n(user.isActive ? "userPage.deactivate" : "userPage.activate")}
                          disabled={updateStatus.isPending}
                          onClick={() => updateStatus.mutate({ id: user.id, isActive: !user.isActive })}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20 text-xs text-muted-foreground">
          <div>
            {translateI18n("userPage.showing", { shown: users.length, total: pagination.total })}
          </div>

          <div className="flex items-center gap-2">
            <span className="mr-2">
              {translateI18n("userPage.page", { page: pagination.page, total: pagination.totalPages || 1 })}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={!pagination.hasPrevPage || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={!pagination.hasNextPage || isLoading}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Modals */}
      <UserFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        userToEdit={selectedUserForEdit}
      />

    </div>
  );
}
