"use client";

import React, { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { useLanguage } from "@/components/i18n/language-provider";
import { RoleGuard } from "@/components/auth/role-guard";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const { user: currentUser } = useAuth();
  const [page, setPage] = useState(1);
  const [limit] = useState(8);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<User | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ user: User; nextActive: boolean } | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

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
    setFeedback(null);
    const isSelf = Boolean(
      currentUser && (
        (currentUser.id && user.id && currentUser.id === user.id) ||
        (currentUser.email && user.email && currentUser.email.toLowerCase() === user.email.toLowerCase())
      )
    );
    if (isSelf && user.isActive) {
      setFeedback({
        type: "error",
        message: translateI18n("userPage.cannotDeactivateSelf"),
      });
      return;
    }
    setStatusTarget({ user, nextActive: !user.isActive });
  };

  const handleConfirmStatusChange = async () => {
    if (!statusTarget) return;
    try {
      await updateStatus.mutateAsync({
        id: statusTarget.user.id,
        isActive: statusTarget.nextActive,
      });
      setFeedback({
        type: "success",
        message: translateI18n("userPage.statusUpdateSuccess"),
      });
      setStatusTarget(null);
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err?.message || translateI18n("userPage.statusUpdateFailed"),
      });
      setStatusTarget(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] min-w-0 space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <UserManagementHeader onAddUser={handleOpenCreate} />

      {/* Alert Notification Banner */}
      {feedback && (
        <div
          role="alert"
          className={`flex items-center justify-between gap-3 rounded-lg border p-3.5 text-sm transition-all ${
            feedback.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
            )}
            <span>{feedback.message}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => setFeedback(null)}
            aria-label={translateI18n("common.close")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

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
                    isCurrentUser={Boolean(
                      currentUser && (
                        (currentUser.id && user.id && currentUser.id === user.id) ||
                        (currentUser.email && user.email && currentUser.email.toLowerCase() === user.email.toLowerCase())
                      )
                    )}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {!isLoading && !isError && pagination.total > 0 && (
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
        )}
      </Card>

      {/* Create / Edit Dialog */}
      <UserFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        userToEdit={selectedUserForEdit}
        isCurrentUser={Boolean(
          selectedUserForEdit && currentUser && (
            (currentUser.id && selectedUserForEdit.id && currentUser.id === selectedUserForEdit.id) ||
            (currentUser.email && selectedUserForEdit.email && currentUser.email.toLowerCase() === selectedUserForEdit.email.toLowerCase())
          )
        )}
      />

      {/* Confirmation Dialog for Status Change */}
      <Dialog
        open={statusTarget !== null}
        onOpenChange={(open) => {
          if (!open && !updateStatus.isPending) setStatusTarget(null);
        }}
      >
        {statusTarget && (
          <>
            <DialogHeader>
              <DialogTitle>
                {statusTarget.nextActive
                  ? translateI18n("userPage.confirmActivateTitle")
                  : translateI18n("userPage.confirmDeactivateTitle")}
              </DialogTitle>
              <DialogDescription>
                {statusTarget.nextActive
                  ? translateI18n("userPage.confirmActivateDesc", { name: statusTarget.user.fullName || statusTarget.user.email })
                  : translateI18n("userPage.confirmDeactivateDesc", { name: statusTarget.user.fullName || statusTarget.user.email })}
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="mt-4 gap-2">
              <Button
                variant="outline"
                onClick={() => setStatusTarget(null)}
                disabled={updateStatus.isPending}
              >
                {translateI18n("common.cancel")}
              </Button>
              <Button
                variant={statusTarget.nextActive ? "default" : "destructive"}
                disabled={updateStatus.isPending}
                onClick={() => void handleConfirmStatusChange()}
                className="gap-2"
              >
                {updateStatus.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {statusTarget.nextActive
                  ? translateI18n("userPage.confirmActivateBtn")
                  : translateI18n("userPage.confirmDeactivateBtn")}
              </Button>
            </DialogFooter>
          </>
        )}
      </Dialog>
    </div>
  );
}
