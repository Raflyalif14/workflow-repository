"use client";

import React from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDeleteUser } from "@/hooks/use-users";
import { User } from "@/types/user";
import { AlertTriangle } from "lucide-react";

interface DeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
}

export function DeleteUserDialog({
  open,
  onOpenChange,
  user,
}: DeleteUserDialogProps) {
  const deleteUserMutation = useDeleteUser();

  const handleDelete = async () => {
    if (!user) return;
    try {
      await deleteUserMutation.mutateAsync(user.id);
      onOpenChange(false);
    } catch (err: any) {
      alert(err.message || "Failed to delete user");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <div className="flex items-center gap-2 text-destructive mb-2">
          <AlertTriangle className="h-5 w-5" />
          <DialogTitle className="text-destructive">Delete / Deactivate User</DialogTitle>
        </div>
        <DialogDescription>
          Are you sure you want to delete <span className="font-semibold text-foreground">{user?.fullName}</span> ({user?.email})?
          If the user is linked to existing projects or milestones, their account will be deactivated instead to preserve historical records.
        </DialogDescription>
      </DialogHeader>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={deleteUserMutation.isPending}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={handleDelete}
          disabled={deleteUserMutation.isPending}
        >
          {deleteUserMutation.isPending ? "Processing..." : "Confirm Delete"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
