"use client";

import { translate as translateI18n, translateStoredError } from "@/i18n";
import { useLanguage } from "@/components/i18n/language-provider";

import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createUserFormSchema,
  updateUserFormSchema,
  CreateUserFormValues,
} from "@/schemas/user.schema";
import { useCreateUser, useUpdateUser } from "@/hooks/use-users";
import { User, UserRole } from "@/types/user";

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userToEdit?: User | null;
}

export function UserFormDialog({
  open,
  onOpenChange,
  userToEdit,
}: UserFormDialogProps) {
  useLanguage();
  const isEditing = !!userToEdit;
  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(isEditing ? (updateUserFormSchema as any) : createUserFormSchema),
    defaultValues: {
      email: "",
      fullName: "",
      role: "SA",
      isActive: true,
    },
  });

  useEffect(() => {
    if (userToEdit) {
      reset({
        email: userToEdit.email,
        fullName: userToEdit.fullName,
        role: userToEdit.role,
        isActive: userToEdit.isActive,
      });
    } else {
      reset({
        email: "",
        fullName: "",
        role: "SA",
        isActive: true,
      });
    }
  }, [userToEdit, reset, open]);

  const onSubmit = async (data: CreateUserFormValues) => {
    try {
      if (isEditing && userToEdit) {
        await updateUserMutation.mutateAsync({
          id: userToEdit.id,
          data: {
            fullName: data.fullName,
            role: data.role,
            isActive: data.isActive,
          },
        });
      } else {
        await createUserMutation.mutateAsync(data);
      }
      onOpenChange(false);
    } catch {
      alert(translateI18n("userForm.saveFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{translateI18n(isEditing ? "userForm.editTitle" : "userForm.createTitle")}</DialogTitle>
        <DialogDescription>
          {isEditing
            ? translateI18n("userForm.editHelp")
            : translateI18n("userForm.createHelp")}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            {translateI18n("userForm.fullName")} *
          </label>
          <Input
            placeholder={translateI18n("userForm.nameExample")}
            {...register("fullName")}
            disabled={isSubmitting}
          />
          {errors.fullName && (
            <p className="text-xs text-destructive mt-1">{translateStoredError(errors.fullName.message || "userForm.fullNameRequired")}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              {translateI18n("userForm.email")} *
            </label>
            <Input
              type="email"
              placeholder="user@company.com"
              {...register("email")}
              disabled={isEditing || isSubmitting}
            />
            {errors.email && (
              <p className="text-xs text-destructive mt-1">{translateStoredError(errors.email.message || "userForm.invalidEmail")}</p>
            )}
          </div>

        </div>

        {!isEditing && (
          <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            {translateI18n("userForm.initialPasswordHelp")}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              {translateI18n("copy.role")} *
            </label>
            <select
              {...register("role")}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
              disabled={isSubmitting}
            >
              <option value="SUPER_ADMIN">{translateI18n("role.SUPER_ADMIN")}</option>
              <option value="SALES">{translateI18n("role.SALES")}</option>
              <option value="HEAD_SA">{translateI18n("role.HEAD_SA")}</option>
              <option value="SA">{translateI18n("role.SA")}</option>
            </select>
            {errors.role && (
              <p className="text-xs text-destructive mt-1">{translateI18n("userForm.roleRequired")}</p>
            )}
          </div>

        </div>

        <div className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="isActive"
            {...register("isActive")}
            className="rounded border-border text-primary focus:ring-primary h-4 w-4 bg-background"
          />
          <label htmlFor="isActive" className="text-sm font-medium cursor-pointer">
            {translateI18n("userForm.active")}
          </label>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {translateI18n("common.cancel")}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {translateI18n(isSubmitting ? "common.saving" : isEditing ? "userForm.update" : "userForm.create")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
