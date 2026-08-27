"use client";

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
      password: "",
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
        password: "",
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
    } catch (err: any) {
      alert(err.message || "Failed to save user");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{isEditing ? "Edit User Account" : "Create New User"}</DialogTitle>
        <DialogDescription>
          {isEditing
            ? "Update user details, assign roles, and manage account status."
            : "Fill in the required information to register a new user in the system."}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Full Name *
          </label>
          <Input
            placeholder="e.g. John Doe"
            {...register("fullName")}
            disabled={isSubmitting}
          />
          {errors.fullName && (
            <p className="text-xs text-destructive mt-1">{errors.fullName.message}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Email Address *
            </label>
            <Input
              type="email"
              placeholder="user@company.com"
              {...register("email")}
              disabled={isEditing || isSubmitting}
            />
            {errors.email && (
              <p className="text-xs text-destructive mt-1">{errors.email.message}</p>
            )}
          </div>

        </div>

        {!isEditing && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Initial Password *
            </label>
            <Input
              type="password"
              placeholder="Minimum 8 characters"
              {...register("password")}
              disabled={isSubmitting}
            />
            {errors.password && (
              <p className="text-xs text-destructive mt-1">{errors.password.message}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Role *
            </label>
            <select
              {...register("role")}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
              disabled={isSubmitting}
            >
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="SALES">Sales</option>
              <option value="HEAD_SA">Head SA</option>
              <option value="SA">SA</option>
            </select>
            {errors.role && (
              <p className="text-xs text-destructive mt-1">{errors.role.message}</p>
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
            User is Active
          </label>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : isEditing ? "Update User" : "Create User"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
