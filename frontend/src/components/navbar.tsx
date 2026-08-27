"use client";

import React from "react";
import Link from "next/link";
import { Layers, LogOut, Plus, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";

export function Navbar() {
  const { user, logout } = useAuth();

  const initials = user?.fullName
    ?.split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md shadow-primary/20">
              <Layers className="h-5 w-5" />
            </div>
            <span>WorkflowHub</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <Link href="/" className="transition hover:text-foreground">
              Dashboard
            </Link>
            <Link href="/projects" className="transition hover:text-foreground">
              Projects
            </Link>
            <Link href="/documents" className="transition hover:text-foreground">
              Documents
            </Link>
            <Link href="/approvals" className="transition hover:text-foreground">
              Approvals
            </Link>
            <Link href="/users" className="transition hover:text-foreground">
              Users
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Button size="sm" className="hidden sm:inline-flex gap-2">
            <Plus className="h-4 w-4" />
            <span>New Workflow</span>
          </Button>
          <div className="hidden md:flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-2 py-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-xs font-bold text-primary">
              {initials || <UserCircle className="h-4 w-4" />}
            </div>
            <div className="max-w-36 text-left">
              <p className="truncate text-xs font-semibold text-foreground">
                {user?.fullName || "User"}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {user?.email}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => void logout()}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
