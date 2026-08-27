"use client";

import React from "react";
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
  resetPasswordFormSchema,
  ResetPasswordFormValues,
} from "@/schemas/user.schema";
import { useResetPassword } from "@/hooks/use-users";
import { User } from "@/types/user";

interface ResetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
}

export function ResetPasswordDialog({
  open,
  onOpenChange,
  user,
}: ResetPasswordDialogProps) {
  const resetPasswordMutation = useResetPassword();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: ResetPasswordFormValues) => {
    if (!user) return;
    try {
      await resetPasswordMutation.mutateAsync({
        id: user.id,
        newPassword: data.newPassword,
      });
      alert(`Password for ${user.fullName} has been successfully reset.`);
      reset();
      onOpenChange(false);
    } catch (err: any) {
      alert(err.message || "Failed to reset password");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Reset User Password</DialogTitle>
        <DialogDescription>
          Set a new password for <span className="font-semibold text-foreground">{user?.fullName}</span>.
          All active login sessions for this user will be revoked immediately.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            New Password *
          </label>
          <Input
            type="password"
            placeholder="Minimum 8 characters"
            {...register("newPassword")}
            disabled={isSubmitting}
          />
          {errors.newPassword && (
            <p className="text-xs text-destructive mt-1">{errors.newPassword.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Confirm Password *
          </label>
          <Input
            type="password"
            placeholder="Re-type new password"
            {...register("confirmPassword")}
            disabled={isSubmitting}
          />
          {errors.confirmPassword && (
            <p className="text-xs text-destructive mt-1">{errors.confirmPassword.message}</p>
          )}
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
            {isSubmitting ? "Resetting..." : "Reset Password"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
