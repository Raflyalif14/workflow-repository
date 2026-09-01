"use client";

import { ReactNode, useState } from "react";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileCheck2,
  History,
  Inbox,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { RoleGuard } from "@/components/auth/role-guard";
import { useAuth } from "@/components/auth/auth-provider";
import { ApprovalActionDialog } from "@/components/approvals/approval-action-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useApprovals, useApprovalStats } from "@/hooks/use-approvals";
import { ApprovalCategory, ApprovalItem, ApprovalStatus } from "@/types/approval";
import { getApprovalTypeDisplay } from "@/lib/workflow-ux-helpers";

export default function ApprovalCenterPage() {
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "HEAD_SA"]}>
      <ApprovalCenterPageContent />
    </RoleGuard>
  );
}

function ApprovalCenterPageContent() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<"NEEDS_REVIEW" | "HISTORY">("NEEDS_REVIEW");
  const [categoryTab, setCategoryTab] = useState<ApprovalCategory>("ALL");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<ApprovalStatus>("ALL");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<ApprovalItem | null>(null);
  const [initialAction, setInitialAction] = useState<"APPROVE" | "REJECT" | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: stats } = useApprovalStats();
  const effectiveStatus: ApprovalStatus = viewMode === "NEEDS_REVIEW" ? "PENDING" : historyStatusFilter;

  const { data: approvals = [], isLoading, isError } = useApprovals({
    type: categoryTab,
    status: effectiveStatus,
    search,
  });

  const displayedApprovals =
    viewMode === "NEEDS_REVIEW"
      ? approvals.filter((item) => item.status === "PENDING")
      : approvals.filter((item) => item.status !== "PENDING");
  const canReview = user?.role === "HEAD_SA";

  const openAction = (item: ApprovalItem, action: "APPROVE" | "REJECT") => {
    setSelectedItem(item);
    setInitialAction(action);
    setIsDialogOpen(true);
  };

  return (
    <div className="container space-y-6 py-8">
      {/* Header */}
      <div className="flex flex-col gap-5 border-b border-border/60 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Head Solution Architect Portal</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Approval Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign off on initial project plans, active project deadline change requests, and Solution Architect deliverables.
          </p>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          title="Total Pending"
          value={stats?.totalPending || 0}
          icon={<ShieldCheck className="h-4 w-4 text-primary" />}
          iconContainerClassName="border-primary/15 bg-primary/10"
          valueClassName="text-primary"
          description="Awaiting your sign-off"
        />
        <Metric
          title="Project Plans"
          value={stats?.pendingProjectPlans || 0}
          icon={<ClipboardCheck className="h-4 w-4 text-primary" />}
          iconContainerClassName="border-primary/15 bg-primary/10"
          valueClassName="text-primary"
          description="Initial timeline approvals"
        />
        <Metric
          title="Deadline Changes"
          value={stats?.pendingDeadlines || 0}
          icon={<CalendarClock className="h-4 w-4 text-amber-400" />}
          iconContainerClassName="border-amber-400/15 bg-amber-400/10"
          valueClassName="text-amber-400"
          description="Active workflow changes"
        />
        <Metric
          title="SA Submissions"
          value={stats?.pendingSubmissions || 0}
          icon={<FileCheck2 className="h-4 w-4 text-emerald-400" />}
          iconContainerClassName="border-emerald-400/15 bg-emerald-400/10"
          valueClassName="text-emerald-400"
          description="Milestone deliverables"
        />
      </div>

      {/* Top-Level Tabs: Needs Review vs History */}
      <div className="space-y-3 rounded-xl border border-border/60 bg-card/70 p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-3">
          <Button
            variant={viewMode === "NEEDS_REVIEW" ? "default" : "outline"}
            size="sm"
            className="h-9 gap-2 rounded-lg text-xs font-semibold"
            onClick={() => {
              setViewMode("NEEDS_REVIEW");
              setHistoryStatusFilter("ALL");
            }}
          >
            <Inbox className="h-4 w-4" />
            <span>Needs Review</span>
            {(stats?.totalPending || 0) > 0 && (
              <span className="rounded-full bg-primary-foreground text-primary px-1.5 py-0.2 text-[10px] font-bold">
                {stats?.totalPending}
              </span>
            )}
          </Button>

          <Button
            variant={viewMode === "HISTORY" ? "default" : "outline"}
            size="sm"
            className="h-9 gap-2 rounded-lg text-xs font-semibold"
            onClick={() => setViewMode("HISTORY")}
          >
            <History className="h-4 w-4" />
            <span>Review History</span>
          </Button>
        </div>

        {/* Category & Search Toolbar */}
        <div className="flex flex-col gap-3 border-t border-border/40 pt-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Category Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-muted/10 p-1">
            {[
              { key: "ALL", label: "All Requests", count: viewMode === "NEEDS_REVIEW" ? stats?.totalPending : undefined },
              { key: "PROJECT_PLAN", label: "Project Plans", count: viewMode === "NEEDS_REVIEW" ? stats?.pendingProjectPlans : undefined },
              { key: "DEADLINE", label: "Deadline Changes", count: viewMode === "NEEDS_REVIEW" ? stats?.pendingDeadlines : undefined },
              { key: "SUBMISSION", label: "SA Submissions", count: viewMode === "NEEDS_REVIEW" ? stats?.pendingSubmissions : undefined },
            ].map((tab) => (
              <Button
                key={tab.key}
                variant={categoryTab === tab.key ? "secondary" : "ghost"}
                size="sm"
                className={`h-8 shrink-0 gap-2 rounded-md px-2.5 text-xs font-medium ${categoryTab === tab.key ? "bg-secondary text-foreground font-semibold shadow-sm" : "text-muted-foreground hover:bg-muted/50"
                  }`}
                onClick={() => setCategoryTab(tab.key as ApprovalCategory)}
              >
                <span>{tab.label}</span>
                {typeof tab.count === "number" && tab.count > 0 && (
                  <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                    {tab.count}
                  </span>
                )}
              </Button>
            ))}
          </div>

          {/* History Status Dropdown if on History tab */}
          {viewMode === "HISTORY" && (
            <select
              value={historyStatusFilter}
              onChange={(event) => setHistoryStatusFilter(event.target.value as ApprovalStatus)}
              className="flex h-9 w-full shrink-0 rounded-lg border border-border/60 bg-background/50 px-3 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-primary sm:w-[180px]"
            >
              <option value="ALL">All Resolved Statuses</option>
              <option value="APPROVED">Approved Only</option>
              <option value="REJECTED">Rejected Only</option>
              <option value="SUPERSEDED">Superseded</option>
            </select>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by project name, customer, milestone, or requester..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-9 border-border/60 bg-background/50 pl-9 text-xs"
          />
        </div>
      </div>

      {/* Approval Items List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-border/60 bg-card/70 shadow-sm" />
          ))}
        </div>
      ) : isError ? (
        <Card className="border-border/60 bg-card/70 shadow-sm">
          <CardContent className="py-16 text-center text-destructive">
            <p className="mx-auto max-w-sm font-semibold">Failed to load approvals. Please check your network connection.</p>
          </CardContent>
        </Card>
      ) : displayedApprovals.length === 0 ? (
        <Card className="border-dashed border-border/60 bg-card/70 shadow-sm">
          <CardContent className="space-y-3 py-16 text-center">
            {viewMode === "NEEDS_REVIEW" ? (
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
            ) : (
              <History className="mx-auto h-10 w-10 text-muted-foreground" />
            )}
            <div>
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                {viewMode === "NEEDS_REVIEW" ? "No Approvals Waiting" : "No Historical Records Found"}
              </h3>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                {viewMode === "NEEDS_REVIEW"
                  ? "You have reviewed all pending project plans, deadline proposals, and SA submissions."
                  : "No matching approval records found for the selected category or filter."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {displayedApprovals.map((item) => (
            <Card
              key={`${item.category}-${item.id}`}
              className="border-border/60 bg-card/70 p-4 shadow-sm transition-colors duration-200 hover:border-primary/25 hover:bg-muted/10"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/40 bg-muted/20 px-2.5 text-xs font-semibold text-foreground">
                      <ApprovalCategoryIcon category={item.category} />
                      <span>{getApprovalTypeDisplay(item.category)}</span>
                    </span>
                    {item.stepOrder && (
                      <Badge variant="outline" className="text-[11px] font-mono">
                        Step {item.stepOrder}
                      </Badge>
                    )}
                    <StatusBadge status={item.status} />
                  </div>

                  <h3 className="text-base font-semibold tracking-tight text-foreground">{item.title}</h3>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/40 pt-2 text-xs text-muted-foreground">
                    <span>
                      Project: <strong className="text-foreground">{item.projectName}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Customer: <strong className="text-foreground">{item.clientName}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Requested by: <strong className="text-foreground">{item.submittedBy}</strong>
                    </span>
                    <span>•</span>
                    <span className="font-mono text-[11px]">
                      {new Date(item.submittedAt).toLocaleDateString("id-ID", { dateStyle: "medium" })}
                    </span>
                  </div>

                  <ApprovalSummary item={item} />
                </div>

                {/* Actions */}
                <div className="flex shrink-0 flex-wrap items-center gap-2 self-start md:self-center">
                  {item.status === "PENDING" && item.isCurrentApproval !== false && canReview ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 rounded-lg border-destructive/30 text-xs text-destructive hover:bg-destructive/10"
                        onClick={() => openAction(item, "REJECT")}
                      >
                        <X className="h-3.5 w-3.5" />
                        <span>Reject</span>
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 gap-1.5 rounded-lg bg-emerald-500 text-xs font-semibold text-black shadow-sm hover:bg-emerald-600"
                        onClick={() => openAction(item, "APPROVE")}
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Approve</span>
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      onClick={() => openAction(item, "APPROVE")}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>View Details</span>
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ApprovalActionDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        item={selectedItem}
        initialAction={initialAction}
      />
    </div>
  );
}

function Metric({
  title,
  value,
  icon,
  iconContainerClassName,
  valueClassName,
  description,
}: {
  title: string;
  value: number;
  icon: ReactNode;
  iconContainerClassName: string;
  valueClassName: string;
  description: string;
}) {
  return (
    <Card className="group h-full border-border/60 bg-card/70 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="space-y-1">
          <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {title}
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground/80">{description}</CardDescription>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${iconContainerClassName}`}>
          {icon}
        </span>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold tracking-tight ${valueClassName}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: ApprovalStatus }) {
  switch (status) {
    case "APPROVED":
      return <Badge variant="success">Approved</Badge>;
    case "REJECTED":
      return <Badge variant="destructive">Rejected</Badge>;
    case "SUPERSEDED":
      return <Badge variant="outline">Superseded</Badge>;
    default:
      return <Badge variant="warning">Pending Review</Badge>;
  }
}

function ApprovalSummary({ item }: { item: ApprovalItem }) {
  if (item.category === "PROJECT_PLAN") {
    return (
      <div className="space-y-1 rounded-xl border border-border/40 bg-muted/15 p-3 text-xs text-muted-foreground">
        {item.requestNote ? (
          <p>
            Plan note: <strong className="text-foreground">&quot;{item.requestNote}&quot;</strong>
          </p>
        ) : (
          <p>Initial project timeline is submitted for sign-off.</p>
        )}
        {item.reviewNote && (
          <p className="text-foreground">
            Review note: <strong>&quot;{item.reviewNote}&quot;</strong>
          </p>
        )}
      </div>
    );
  }

  if (item.category === "DEADLINE") {
    return (
      <div className="grid gap-2 text-xs sm:grid-cols-2 pt-1">
        <DeadlineMini title="Effective Applied Timeline" deadline={item.currentDeadline} />
        <DeadlineMini title="Proposed Change Request" deadline={item.proposedDeadline} />
      </div>
    );
  }

  if (item.category === "SUBMISSION") {
    return (
      <div className="space-y-1 rounded-xl border border-border/40 bg-muted/15 p-3 text-xs text-muted-foreground">
        <p>
          Submitted Deliverable for Step {item.stepOrder || "-"}: <strong className="text-foreground">{item.milestoneName}</strong>
        </p>
        {item.submissionNote && (
          <p>
            Submission Note: <strong className="text-foreground">&quot;{item.submissionNote}&quot;</strong>
          </p>
        )}
        {item.reviewNote && (
          <p className="text-foreground font-medium">
            Review Feedback: <strong>&quot;{item.reviewNote}&quot;</strong>
          </p>
        )}
      </div>
    );
  }

  return null;
}

function DeadlineMini({
  title,
  deadline,
}: {
  title: string;
  deadline?: {
    start_date?: string | null;
    duration_working_days?: number | null;
    due_date?: string | null;
    change_reason?: string | null;
  } | null;
}) {
  return (
    <div className="space-y-0.5 rounded-xl border border-border/40 bg-muted/15 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">{title}</p>
      <p className="text-muted-foreground text-xs">
        Start: <strong className="text-foreground">{formatDate(deadline?.start_date)}</strong> • Duration:{" "}
        <strong className="text-foreground">{deadline?.duration_working_days || "-"} days</strong> • Due:{" "}
        <strong className="text-foreground">{formatDate(deadline?.due_date)}</strong>
      </p>
      {deadline?.change_reason && (
        <p className="text-muted-foreground text-xs italic">
          Reason: &quot;{deadline.change_reason}&quot;
        </p>
      )}
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("id-ID", { dateStyle: "medium" });
}

function ApprovalCategoryIcon({ category }: { category: ApprovalItem["category"] }) {
  if (category === "DEADLINE") return <CalendarClock className="h-3.5 w-3.5 text-amber-400" />;
  if (category === "SUBMISSION") return <FileCheck2 className="h-3.5 w-3.5 text-emerald-400" />;
  return <ClipboardCheck className="h-3.5 w-3.5 text-primary" />;
}
