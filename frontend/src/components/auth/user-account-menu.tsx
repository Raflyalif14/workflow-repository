"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, KeyRound, LogOut, Settings } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { Badge } from "@/components/ui/badge";
import { formatActorRoleLabel } from "@/lib/workflow-ux-helpers";
import { getUserInitials } from "@/components/settings/account-profile-card";

export function UserAccountMenu() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (!user) return null;

  const initials = getUserInitials(user.fullName);

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
  };

  return (
    <div ref={menuRef} className="relative inline-block text-left" data-testid="user-account-menu">
      {/* Trigger Button */}
      <button
        type="button"
        id="user-menu-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={user.fullName || t("nav.userAccount")}
        className={`flex h-10 items-center gap-2 rounded-xl p-1.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          isOpen ? "bg-muted/60 ring-1 ring-border" : ""
        }`}
      >
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary ring-1 ring-primary/20">
          {initials}
          <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-card" />
        </div>

        <div className="hidden text-left md:block">
          <p className="max-w-[120px] truncate text-xs font-semibold leading-tight text-foreground">
            {user.fullName || t("nav.userAccount")}
          </p>
          <p className="max-w-[120px] truncate text-[10px] leading-tight text-muted-foreground">
            {formatActorRoleLabel(user.role)}
          </p>
        </div>

        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown Menu Panel */}
      {isOpen && (
        <div
          role="menu"
          aria-labelledby="user-menu-trigger"
          className="absolute right-0 z-50 mt-2 w-72 origin-top-right rounded-2xl border border-border bg-popover p-1.5 shadow-xl focus:outline-none animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Identity Header */}
          <div className="border-b border-border/60 px-3 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-deep text-sm font-bold text-primary-foreground shadow-sm">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {user.fullName || t("nav.userAccount")}
                </p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between">
              <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary text-[10px] font-medium">
                {formatActorRoleLabel(user.role)}
              </Badge>
              <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {t("userMenu.activeStatus")}
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="py-1">
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Settings className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>{t("userMenu.settings")}</span>
            </Link>

            <Link
              href="/settings#change-password"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                if (typeof window !== "undefined" && window.location.pathname === "/settings") {
                  const target = document.getElementById("change-password");
                  if (target) {
                    target.scrollIntoView({ behavior: "smooth", block: "start" });
                    target.querySelector<HTMLInputElement>("input")?.focus();
                  }
                }
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>{t("userMenu.changePassword")}</span>
            </Link>
          </div>

          {/* Divider & Logout */}
          <div className="border-t border-border/60 pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span>{t("userMenu.logout")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
