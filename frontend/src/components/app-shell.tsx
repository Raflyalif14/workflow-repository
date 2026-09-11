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
import { useMyAssignedMilestones } from "@/hooks/use-projects";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { SYSTEM_SETTINGS_ALLOWED_ROLES } from "@/lib/settings-access";
import { GlobalSearchDialog } from "@/components/global-search-dialog";
import { formatActorRoleLabel } from "@/lib/workflow-ux-helpers";

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
  label: string;
  href: string;
  icon: any;
  allowedRoles?: string[]; // If undefined, visible to all roles
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Projects",
    href: "/projects",
    icon: FolderKanban,
  },
  {
    label: "Milestones",
    href: "/milestones",
    icon: Milestone,
  },
  {
    label: "Approvals",
    href: "/approvals",
    icon: ShieldCheck,
    allowedRoles: ["SUPER_ADMIN", "HEAD_SA"],
  },
  {
    label: "Documents",
    href: "/documents",
    icon: FileText,
  },
  {
    label: "Users",
    href: "/users",
    icon: Users,
    allowedRoles: ["SUPER_ADMIN"],
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    allowedRoles: SYSTEM_SETTINGS_ALLOWED_ROLES,
  },
];

// ─── Sidebar Component ───
export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = useSidebar();
  const { user } = useAuth();

  const userRole = user?.role || "GUEST";
  const { data: approvalStats } = useApprovalStats();
  const isAssignedMilestoneRole = userRole === "SA" || userRole === "HEAD_SA";
  const { data: assignedMilestones = [] } = useMyAssignedMilestones(isAssignedMilestoneRole);

  const pendingApprovalsCount =
    userRole === "HEAD_SA" || userRole === "SUPER_ADMIN" ? approvalStats?.totalPending || 0 : 0;

  const assignedActionableMilestonesCount =
    isAssignedMilestoneRole
      ? assignedMilestones.filter((m) => m.status === "IN_PROGRESS" || m.status === "REJECTED").length
      : 0;

  const getBadgeCount = (href: string) => {
    if (href === "/approvals") return pendingApprovalsCount;
    if (href === "/milestones" && isAssignedMilestoneRole) return assignedActionableMilestonesCount;
    return 0;
  };

  // Filter navigation links based on user role
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (!item.allowedRoles) return true;
    return item.allowedRoles.includes(userRole);
  });

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-[hsl(var(--sidebar-border))] px-3 shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
          <Layers className="h-4 w-4" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-semibold text-foreground leading-tight">WorkflowHub</h1>
          </div>
        )}
      </div>

      {/* Dynamic Role Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {visibleNavItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          const badgeCount = getBadgeCount(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              title={collapsed ? item.label : undefined}
              className={`
                group relative flex h-10 items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors
                ${collapsed ? "justify-center px-0" : ""}
                ${active
                  ? "bg-primary/10 text-foreground"
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
                      ? "text-foreground"
                      : "text-[hsl(var(--sidebar-foreground))] group-hover:text-foreground"
                    }`}
                />
                {collapsed && badgeCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                )}
              </div>

              {!collapsed && (
                <div className="flex flex-1 items-center justify-between overflow-hidden">
                  <span className="truncate leading-tight">{item.label}</span>
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
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex h-10 w-full items-center gap-2.5 rounded-md px-3 text-sm text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-hover))] hover:text-foreground transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-[18px] w-[18px] shrink-0 mx-auto" />
          ) : (
            <>
              <ChevronLeft className="h-[18px] w-[18px] shrink-0" />
              <span>Collapse</span>
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
        {sidebarContent}
      </aside>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-background/80"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`lg:hidden fixed top-0 left-0 bottom-0 z-50 w-[var(--sidebar-width)] border-r border-[hsl(var(--sidebar-border))] transition-transform duration-300 ease-in-out ${mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        style={{ background: "hsl(var(--sidebar-bg))" }}
      >
        {/* Mobile Close Button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-3 p-1 rounded-md text-[hsl(var(--sidebar-foreground))] hover:text-foreground hover:bg-[hsl(var(--sidebar-hover))] transition"
        >
          <X className="h-5 w-5" />
        </button>
        {sidebarContent}
      </aside>
    </>
  );
}

// ─── Top Bar (Header) Component ───
export function TopBar() {
  const { setMobileOpen } = useSidebar();
  const { user, logout } = useAuth();
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
    <header className="sticky top-0 z-30 h-14 border-b border-border/50 bg-background/95">
      <div className="flex h-full items-center justify-between px-4 sm:px-5 lg:px-6">
        {/* Left: Mobile Hamburger + Global Search */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Global Search */}
          <div ref={globalSearchRef} className="sm:relative">
            <button
              type="button"
              onClick={() => setGlobalSearchOpen(true)}
              aria-label="Open global search"
              aria-expanded={globalSearchOpen}
              aria-haspopup="dialog"
              aria-controls={globalSearchOpen ? "global-search-panel" : undefined}
              className="flex h-9 w-9 items-center justify-center gap-2 rounded-md px-2 text-left text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground sm:w-72 sm:justify-start sm:px-3 lg:w-80"
            >
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline text-xs">Search projects, documents...</span>
              <kbd className="ml-auto hidden rounded border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:block">
                Ctrl K
              </kbd>
            </button>
            <GlobalSearchDialog open={globalSearchOpen} onOpenChange={setGlobalSearchOpen} />
          </div>
        </div>

        {/* Right: User Profile & Actions */}
        <div className="flex items-center gap-2">
          <NotificationBell enabled={Boolean(user)} />

          <div className="flex h-10 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-semibold text-foreground">
              {getInitials(user?.fullName)}
            </div>
            <div className="hidden sm:block text-left">
              <p className="max-w-[130px] truncate text-xs font-semibold leading-tight text-foreground">
                {user?.fullName || "User Account"}
              </p>
              <p className="text-[10px] leading-tight text-muted-foreground">
                {formatActorRoleLabel(user?.role)}
              </p>
            </div>

            {/* Logout Button */}
            <button
              onClick={() => logout()}
              className="ml-1 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              title="Sign Out"
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

  return (
    <SidebarContext.Provider
      value={{ collapsed, setCollapsed, mobileOpen, setMobileOpen }}
    >
      <div className="relative min-h-screen bg-background text-foreground">
        <Sidebar />

        {/* Main Content Area - offset by sidebar width */}
        <div
          className={`transition-all duration-300 ease-in-out ${collapsed
              ? "lg:ml-[var(--sidebar-collapsed-width)]"
              : "lg:ml-[var(--sidebar-width)]"
            }`}
        >
          <TopBar />
          <main className="min-h-[calc(100vh-3.5rem)]">
            {children}
          </main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
