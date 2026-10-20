"use client";

import React, { useState } from "react";
import { useLanguage } from "@/components/i18n/language-provider";
import { RoleGuard } from "@/components/auth/role-guard";
import { Card } from "@/components/ui/card";
import { useUsers, useUpdateUserStatus } from "@/hooks/use-users";
import { User, UserRole } from "@/types/user";
import { UserFormDialog } from "@/components/users/user-form-dialog";
import { UserManagementHeader } from "@/components/users/user-management-header";
import { UserManagementFilters } from "@/components/users/user-management-filters";
import { UserTableRow } from "@/components/users/user-table-row";
import { UserPagination } from "@/components/users/user-pagination";
import { translate as translateI18n } from "@/i18n";

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

  // Dialog state
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

  const handleOpenCreate = () => {
    setSelectedUserForEdit(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (user: User) => {
    setSelectedUserForEdit(user);
    setIsFormOpen(true);
  };

  const handleToggleStatus = (user: User) => {
    updateStatus.mutate({ id: user.id, isActive: !user.isActive });
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] min-w-0 space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <UserManagementHeader onAddUser={handleOpenCreate} />

      {/* Filter and Search Bar */}
      <UserManagementFilters
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        roleFilter={roleFilter}
        onRoleFilterChange={(value) => {
          setRoleFilter(value);
          setPage(1);
        }}
        statusFilter={statusFilter}
        onStatusFilterChange={(value) => {
          setStatusFilter(value);
          setPage(1);
        }}
      />

      {/* Table Card */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 border-b border-border text-xs uppercase font-semibold tracking-wider text-muted-foreground">
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
                  <UserTableRow
                    key={user.id}
                    user={user}
                    onEdit={handleOpenEdit}
                    onToggleStatus={handleToggleStatus}
                    isStatusUpdating={updateStatus.isPending}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <UserPagination
          shownCount={users.length}
          totalCount={pagination.total}
          currentPage={pagination.page}
          totalPages={pagination.totalPages || 1}
          hasPrevPage={pagination.hasPrevPage}
          hasNextPage={pagination.hasNextPage}
          isLoading={isLoading}
          onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
          onNextPage={() => setPage((p) => p + 1)}
        />
      </Card>

      {/* Create / Edit Dialog */}
      <UserFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        userToEdit={selectedUserForEdit}
      />
    </div>
  );
}
