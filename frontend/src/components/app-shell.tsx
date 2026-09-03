"use client";

import React, { useState, createContext, useContext } from "react";
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
  HelpCircle,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useApprovalStats } from "@/hooks/use-approvals";
import { useMyAssignedMilestones } from "@/hooks/use-projects";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { SYSTEM_SETTINGS_ALLOWED_ROLES } from "@/lib/settings-access";

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
  description: string;
  allowedRoles?: string[]; // If undefined, visible to all roles
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    description: "Overview & Analytics",
  },
  {
    label: "Projects",
    href: "/projects",
    icon: FolderKanban,
    description: "Project Management",
  },
  {
    label: "Milestones",
    href: "/milestones",
    icon: Milestone,
    description: "Workflow Progress",
  },
  {
    label: "Approvals",
    href: "/approvals",
    icon: ShieldCheck,
    description: "Sign-Off Center",
    allowedRoles: ["SUPER_ADMIN", "HEAD_SA"],
  },
  {
    label: "Documents",
    href: "/documents",
    icon: FileText,
    description: "File Repository",
  },
  {
    label: "Users",
    href: "/users",
    icon: Users,
    description: "Account Management",
    allowedRoles: ["SUPER_ADMIN"],
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    description: "System Configuration",
    allowedRoles: SYSTEM_SETTINGS_ALLOWED_ROLES,
  },
];

// ─── Sidebar Component ───
export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = useSidebar();
  const { user, logout } = useAuth();

  const userRole = user?.role || "GUEST";
  const { data: approvalStats } = useApprovalStats();
  const { data: assignedMilestones = [] } = useMyAssignedMilestones(userRole === "SA");

  const pendingApprovalsCount =
    userRole === "HEAD_SA" || userRole === "SUPER_ADMIN" ? approvalStats?.totalPending || 0 : 0;

  const saActionableMilestonesCount =
    userRole === "SA"
      ? assignedMilestones.filter((m) => m.status === "IN_PROGRESS" || m.status === "REJECTED").length
      : 0;

  const getBadgeCount = (href: string) => {
    if (href === "/approvals") return pendingApprovalsCount;
    if (href === "/milestones" && userRole === "SA") return saActionableMilestonesCount;
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
      <div className="flex items-center gap-3 px-4 h-16 border-b border-[hsl(var(--sidebar-border))] shrink-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20 shrink-0">
          <Layers className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="animate-fade-in overflow-hidden">
            <h1 className="text-sm font-bold text-foreground tracking-tight leading-tight">
              WorkflowHub
            </h1>
            <p className="text-[10px] text-[hsl(var(--sidebar-foreground))] font-medium tracking-wide">
              {userRole.replace(/_/g, " ")} Workspace
            </p>
          </div>
        )}
      </div>

      {/* Section Label */}
      {!collapsed && (
        <div className="px-4 pt-6 pb-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[hsl(var(--sidebar-foreground))]">
            Main Navigation
          </span>
        </div>
      )}

      {/* Dynamic Role Navigation */}
      <nav className="flex-1 space-y-1.5 overflow-y-auto px-3 py-2">
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
                group relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200
                ${collapsed ? "justify-center px-0" : ""}
                ${active
                  ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/10"
                  : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-hover))] hover:text-foreground"
                }
              `}
            >
              {/* Active indicator bar */}
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
              )}

              <div className="relative shrink-0">
                <Icon
                  className={`h-[18px] w-[18px] transition-colors duration-200 ${active
                      ? "text-primary"
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
                <div className="flex flex-1 items-center justify-between overflow-hidden animate-fade-in">
                  <div className="flex flex-col overflow-hidden">
                    <span className="truncate leading-tight">{item.label}</span>
                    <span
                      className={`text-[10px] truncate leading-tight ${active ? "text-primary/60" : "text-[hsl(var(--sidebar-foreground))]"
                        }`}
                    >
                      {item.description}
                    </span>
                  </div>
                  {badgeCount > 0 && (
                    <span
                      className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-tight ${active
                          ? "bg-primary text-primary-foreground"
                          : "bg-primary/20 text-primary group-hover:bg-primary group-hover:text-primary-foreground"
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
      <div className="border-t border-[hsl(var(--sidebar-border))] p-3 space-y-1 shrink-0">
        {!collapsed && (
          <button
            onClick={() => logout()}
            className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-all duration-200"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            <span>Sign Out</span>
          </button>
        )}

        {/* Collapse Toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-hover))] hover:text-foreground transition-all duration-200"
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
          className="lg:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
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
    <header className="sticky top-0 z-30 h-16 border-b border-border/60 bg-background/85 backdrop-blur-xl">
      <div className="flex h-full items-center justify-between px-4 sm:px-5 lg:px-7">
        {/* Left: Mobile Hamburger + Global Search */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Global Search */}
          <div className="hidden sm:flex h-9 w-72 lg:w-80 items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 text-muted-foreground transition-all hover:border-primary/30 hover:bg-muted/50">
            <Search className="h-3.5 w-3.5" />
            <span className="text-xs">Search projects, documents...</span>
            <kbd className="ml-auto rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Ctrl K
            </kbd>
          </div>
        </div>

        {/* Right: User Profile & Actions */}
        <div className="flex items-center gap-3">
          <NotificationBell enabled={Boolean(user)} />

          {/* User Profile Pill */}
          <div className="flex h-10 items-center gap-2.5 rounded-xl border border-border/60 bg-muted/25 pl-1.5 pr-2 shadow-sm">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground shadow-sm">
              {getInitials(user?.fullName)}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-semibold text-foreground leading-tight truncate max-w-[130px]">
                {user?.fullName || "User Account"}
              </p>
              <p className="text-[10px] text-primary leading-tight font-semibold">
                {user?.role?.replace(/_/g, " ") || "Member"}
              </p>
            </div>

            {/* Logout Button */}
            <button
              onClick={() => logout()}
              className="ml-1 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
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
          <main className="min-h-[calc(100vh-4rem)] animate-fade-in">
            {children}
          </main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
