"use client";

import React from "react";
import { useAuth } from "./auth-provider";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface RoleGuardProps {
  allowedRoles: string[];
  children: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex py-20 items-center justify-center text-sm text-muted-foreground">
        Checking access permissions...
      </div>
    );
  }

  if (user?.mustChangePassword) {
    return (
      <div className="flex py-20 items-center justify-center text-sm text-muted-foreground">
        Redirecting to password change...
      </div>
    );
  }

  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <div className="container py-20 text-center space-y-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/15 text-destructive mx-auto border border-destructive/30">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <div className="space-y-1 max-w-md mx-auto">
          <h2 className="text-xl font-bold text-foreground">Access Restricted</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your role (<strong className="text-primary">{user?.role?.replace(/_/g, " ")}</strong>) does not have permission to view or manage this page.
          </p>
        </div>
        <Link href="/">
          <Button variant="outline" className="gap-2 mt-2">
            Return to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
