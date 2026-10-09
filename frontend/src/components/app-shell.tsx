"use client";

import React, { useState, createContext, useContext, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  Milestone,
  ShieldCheck,
  FileText,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Search,
  Menu,
  X,
  Layers,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useApprovalStats } from "@/hooks/use-approvals";
import { canReadApprovalOverview } from "@/lib/approval-overview-access";
import { useMyAssignedMilestones } from "@/hooks/use-projects";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useLanguage } from "@/components/i18n/language-provider";
import { PERSONAL_SETTINGS_ALLOWED_ROLES, canShowNavigationItem } from "@/lib/settings-access";
import type { TranslationKey } from "@/i18n";
import { GlobalSearchDialog } from "@/components/global-search-dialog";
import { formatActorRoleLabel } from "@/lib/workflow-ux-helpers";
import { countAssignedMilestonesNeedingAction } from "@/lib/assigned-milestone-ux";

// ─── Sidebar Context ───
interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (val: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (val: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType>({
  collapsed: false,
  setCollapsed: () => { },
  mobileOpen: false,
  setMobileOpen: () => { },
});

export const useSidebar = () => useContext(SidebarContext);

// ─── Role-Based Navigation Config ───
export interface NavItem {
  labelKey: TranslationKey;
  href: string;
  icon: any;
  allowedRoles?: string[]; // If undefined, visible to all roles
}

const NAV_ITEMS: NavItem[] = [
  {
    labelKey: "nav.dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    labelKey: "nav.projects",
    href: "/projects",
    icon: FolderKanban,
  },
  {
    labelKey: "nav.milestones",
    href: "/milestones",
    icon: Milestone,
    allowedRoles: ["SUPER_ADMIN", "HEAD_SA", "SA"],
  },
  {
    labelKey: "nav.approvals",
    href: "/approvals",
    icon: ShieldCheck,
    allowedRoles: ["SUPER_ADMIN", "HEAD_SA"],
  },
  {
    labelKey: "nav.documents",
    href: "/documents",
    icon: FileText,
  },
  {
    labelKey: "nav.users",
    href: "/users",
    icon: Users,
    allowedRoles: ["SUPER_ADMIN"],
  },
  {
    labelKey: "nav.settings",
    href: "/settings",
    icon: Settings,
    allowedRoles: PERSONAL_SETTINGS_ALLOWED_ROLES,
  },
];

// ─── Sidebar Component ───
export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = useSidebar();
  const { user } = useAuth();
  const { t } = useLanguage();

  const userRole = user?.role || "GUEST";
  const canLoadApprovalOverview = canReadApprovalOverview(user?.role);
  const { data: approvalStats } = useApprovalStats(canLoadApprovalOverview, true);
  const isAssignedMilestoneRole = userRole === "SA" || userRole === "HEAD_SA";
  const { data: assignedMilestones = [] } = useMyAssignedMilestones(isAssignedMilestoneRole);

  const pendingApprovalsCount =
    canLoadApprovalOverview ? approvalStats?.totalPending || 0 : 0;

  const assignedActionableMilestonesCount =
    isAssignedMilestoneRole
      ? countAssignedMilestonesNeedingAction(assignedMilestones)
      : 0;

  const getBadgeCount = (href: string) => {
    if (href === "/approvals") return pendingApprovalsCount;
    if (href === "/milestones" && isAssignedMilestoneRole) return assignedActionableMilestonesCount;
    return 0;
  };

  // Filter navigation links based on user role
  const visibleNavItems = NAV_ITEMS.filter((item) => canShowNavigationItem(user?.role, item.allowedRoles));

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const sidebarContent = (compact: boolean) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex h-20 items-center gap-3 px-5 shrink-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shrink-0">
          <Layers className="h-4 w-4" />
        </div>
        {!compact && (
          <div className="overflow-hidden">
            <h1 className="text-base font-bold tracking-tight text-foreground leading-tight">WorkflowHub</h1>
          </div>
        )}
      </div>

      {/* Dynamic Role Navigation */}
      <nav aria-label={t("nav.workspaceNavigation")} className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4">
        {visibleNavItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          const badgeCount = getBadgeCount(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              title={item.href === "/milestones" && isAssignedMilestoneRole
                ? `${t(item.labelKey)} — ${t("milestonePage.needsAction")}: ${badgeCount}`
                : compact ? t(item.labelKey) : undefined}
              aria-label={compact ? t(item.labelKey) : undefined}
              aria-current={active ? "page" : undefined}
              className={`
                group relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30
                ${compact ? "justify-center px-0" : ""}
                ${active
                  ? "bg-primary-soft text-primary font-semibold"
                  : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-hover))] hover:text-foreground"
                }
              `}
            >
              {/* Active indicator bar */}
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-primary" />
              )}

              <div className="relative shrink-0">
                <Icon
                  className={`h-[17px] w-[17px] transition-colors ${active
                      ? "text-primary"
                      : "text-[hsl(var(--sidebar-foreground))] group-hover:text-foreground"
                    }`}
                />
                {compact && badgeCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                )}
              </div>

              {!compact && (
                <div className="flex flex-1 items-center justify-between overflow-hidden">
                  <span className="truncate leading-tight">{t(item.labelKey)}</span>
                  {badgeCount > 0 && (
                    <span
                      className={`ml-2 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${active
                          ? "bg-primary text-primary-foreground"
                          : "bg-primary/15 text-primary"
                        }`}
                    >
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  )}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-[hsl(var(--sidebar-border))] p-2 shrink-0">
        {/* Collapse Toggle */}
        <button
          type="button"
          onClick={() => setCollapsed(!compact)}
          aria-label={compact ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
          className="hidden lg:flex min-h-10 w-full items-center gap-2.5 rounded-md px-3 text-sm text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-hover))] hover:text-foreground transition-colors"
          title={compact ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
        >
          {compact ? (
            <ChevronRight className="h-[18px] w-[18px] shrink-0 mx-auto" />
          ) : (
            <>
              <ChevronLeft className="h-[18px] w-[18px] shrink-0" />
              <span>{t("nav.collapseSidebar")}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col fixed top-0 left-0 bottom-0 z-40 border-r border-[hsl(var(--sidebar-border))] transition-all duration-300 ease-in-out ${collapsed ? "w-[var(--sidebar-collapsed-width)]" : "w-[var(--sidebar-width)]"
          }`}
        style={{ background: "hsl(var(--sidebar-bg))" }}
      >
        {sidebarContent(collapsed)}
      </aside>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-slate-950/35"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        id="mobile-navigation"
        role={mobileOpen ? "dialog" : undefined}
        aria-modal={mobileOpen ? true : undefined}
        aria-label={t("nav.workspaceNavigation")}
        aria-hidden={!mobileOpen}
        inert={!mobileOpen}
        className={`lg:hidden fixed top-0 left-0 bottom-0 z-50 max-w-[85vw] w-[var(--sidebar-width)] border-r border-[hsl(var(--sidebar-border))] transition-transform duration-300 ease-in-out ${mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        style={{ background: "hsl(var(--sidebar-bg))" }}
      >
        {/* Mobile Close Button */}
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label={t("nav.closeNavigation")}
          className="absolute top-6 right-2 z-10 flex h-9 w-9 items-center justify-center rounded-lg text-[hsl(var(--sidebar-foreground))] hover:text-foreground hover:bg-[hsl(var(--sidebar-hover))] transition"
        >
          <X className="h-5 w-5" />
        </button>
        {sidebarContent(false)}
      </aside>
    </>
  );
}

// ─── Top Bar (Header) Component ───
export function TopBar() {
  const { setMobileOpen, mobileOpen } = useSidebar();
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const globalSearchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleGlobalSearchShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setGlobalSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleGlobalSearchShortcut);
    return () => window.removeEventListener("keydown", handleGlobalSearchShortcut);
  }, []);

  useEffect(() => {
    if (!globalSearchOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!globalSearchRef.current?.contains(event.target as Node)) setGlobalSearchOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [globalSearchOpen]);

  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-border bg-card/95 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between gap-2 px-3 sm:px-6 lg:px-8">
        {/* Left: Mobile Hamburger + Global Search */}
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label={t("nav.openNavigation")}
            aria-controls="mobile-navigation"
            aria-expanded={mobileOpen}
            className="lg:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Global Search */}
          <div ref={globalSearchRef} className="sm:relative">
            <button
              type="button"
              onClick={() => setGlobalSearchOpen(true)}
              aria-label={t("nav.openSearch")}
              aria-expanded={globalSearchOpen}
              aria-haspopup="dialog"
              aria-controls={globalSearchOpen ? "global-search-panel" : undefined}
              className="flex h-10 w-10 items-center justify-center gap-2 rounded-xl border border-transparent bg-muted/60 px-2 text-left text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground sm:w-52 sm:justify-start sm:border-border sm:px-3 xl:w-80"
            >
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline text-sm">{t("nav.searchPlaceholder")}</span>
              <kbd className="ml-auto hidden rounded border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:block">
                Ctrl K
              </kbd>
            </button>
            <GlobalSearchDialog open={globalSearchOpen} onOpenChange={setGlobalSearchOpen} />
          </div>
        </div>

        {/* Right: User Profile & Actions */}
        <div className="flex items-center gap-2">
          <LanguageSwitcher compact />
          <NotificationBell enabled={Boolean(user)} />

          <div className="flex h-10 items-center gap-2">
            <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft sm:flex text-xs font-bold text-primary">
              {getInitials(user?.fullName)}
            </div>
            <div className="hidden md:block text-left">
              <p className="max-w-[130px] truncate text-xs font-semibold leading-tight text-foreground">
                {user?.fullName || t("nav.userAccount")}
              </p>
              <p className="text-[10px] leading-tight text-muted-foreground">
                {formatActorRoleLabel(user?.role)}
              </p>
            </div>

            {/* Logout Button */}
            <button
              type="button"
              onClick={() => logout()}
              aria-label={t("nav.logout")}
              className="ml-1 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              title={t("nav.logout")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

// ─── Shell Layout Provider ───
export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const navigation = document.getElementById("mobile-navigation");
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(navigation?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), select:not([disabled]), [tabindex="0"]'
    ) || []).filter(element => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setMobileOpen(false); }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0], last = items[items.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const closeOnDesktop = () => { if (window.matchMedia("(min-width: 1024px)").matches) setMobileOpen(false); };
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", closeOnDesktop);
    return () => {
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", closeOnDesktop);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [mobileOpen]);

  return (
    <SidebarContext.Provider
      value={{ collapsed, setCollapsed, mobileOpen, setMobileOpen }}
    >
      <div className="relative min-h-screen bg-background text-foreground">
        <Sidebar />

        {/* Main Content Area - offset by sidebar width */}
        <div
          className={`min-w-0 transition-all duration-300 ease-in-out ${collapsed
              ? "lg:ml-[var(--sidebar-collapsed-width)]"
              : "lg:ml-[var(--sidebar-width)]"
            }`}
        >
          <TopBar />
          <main className="min-h-[calc(100vh-4rem)] min-w-0">
            {children}
          </main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
