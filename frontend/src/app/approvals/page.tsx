"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  X,
} from "lucide-react";
import { ApprovalActionDialog } from "@/components/approvals/approval-action-dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { RoleGuard } from "@/components/auth/role-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApprovals, useApprovalStats } from "@/hooks/use-approvals";
import { getApprovalTypeDisplay } from "@/lib/workflow-ux-helpers";
import { ApprovalCategory, ApprovalItem, ApprovalStatus } from "@/types/approval";

const categoryOptions: Array<{ key: ApprovalCategory; label: string }> = [
  { key: "ALL", label: "All requests" },
  { key: "PROJECT_PLAN", label: "Project plans" },
  { key: "DEADLINE", label: "Deadline changes" },
  { key: "SUBMISSION", label: "Work submissions" },
];

const categoryOrder: ApprovalItem["category"][] = ["PROJECT_PLAN", "SUBMISSION", "DEADLINE"];

export default function ApprovalCenterPage() {
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "HEAD_SA"]}>
      <ApprovalCenterPageContent />
    </RoleGuard>
  );
}

function ApprovalCenterPageContent() {
  const router = useRouter();
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<"NEEDS_REVIEW" | "HISTORY">("NEEDS_REVIEW");
  const [categoryTab, setCategoryTab] = useState<ApprovalCategory>("ALL");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<ApprovalStatus>("ALL");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<ApprovalItem | null>(null);
  const [initialAction, setInitialAction] = useState<"APPROVE" | "REJECT" | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: stats } = useApprovalStats();
  const effectiveStatus: ApprovalStatus =
    viewMode === "NEEDS_REVIEW" ? "PENDING" : historyStatusFilter;
  const { data: approvals = [], isLoading, isError } = useApprovals({
    type: categoryTab,
    status: effectiveStatus,
    search,
  });
  const canReview = user?.role === "HEAD_SA";
  const isHistory = viewMode === "HISTORY";
  const displayedApprovals = useMemo(() => {
    const filtered = approvals.filter((item) =>
      isHistory ? item.status !== "PENDING" : item.status === "PENDING"
    );
    return [...filtered].sort((left, right) => {
      const leftTime = new Date(left.requestedAt || left.submittedAt).getTime();
      const rightTime = new Date(right.requestedAt || right.submittedAt).getTime();
      return isHistory ? rightTime - leftTime : leftTime - rightTime;
    });
  }, [approvals, isHistory]);
  const groupedApprovals = useMemo(
    () =>
      categoryOrder
        .map((category) => ({
          category,
          items: displayedApprovals.filter((item) => item.category === category),
        }))
        .filter((group) => group.items.length > 0),
    [displayedApprovals]
  );
  const snapshot = [
    { label: "Total pending", value: stats?.totalPending || 0 },
    { label: "Project plans", value: stats?.pendingProjectPlans || 0 },
    { label: "Deadline changes", value: stats?.pendingDeadlines || 0 },
    { label: "Work submissions", value: stats?.pendingSubmissions || 0 },
  ];

  const openAction = (item: ApprovalItem, action: "APPROVE" | "REJECT") => {
    setSelectedItem(item);
    setInitialAction(action);
    setIsDialogOpen(true);
  };

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <header className="border-b border-border/60 pb-5">
        <p className="text-xs font-semibold uppercase text-primary">
          {canReview ? "Head SA review workspace" : "Approval oversight"}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">
          {canReview ? "Review queue" : "Approval center"}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {canReview
            ? "Review project plans, deadline changes, and submitted milestone work."
            : "Inspect current and historical workflow approval decisions."}
        </p>
      </header>

      <section
        aria-label="Approval snapshot"
        className="grid grid-cols-2 overflow-hidden rounded-lg border border-border/60 bg-card lg:grid-cols-4"
      >
        {snapshot.map((item, index) => (
          <div
            key={item.label}
            className={`border-border/60 px-4 py-3.5 sm:px-5 ${
              index % 2 === 1 ? "border-l" : ""
            } ${index >= 2 ? "border-t" : ""} ${
              index > 0 ? "lg:border-l" : ""
            } lg:border-t-0`}
          >
            <p className="text-2xl font-semibold text-foreground">{item.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-lg border border-border/60 bg-card">
        <div className="space-y-4 border-b border-border/60 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              <Button
                variant={!isHistory ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
                onClick={() => {
                  setViewMode("NEEDS_REVIEW");
                  setHistoryStatusFilter("ALL");
                }}
              >
                <Inbox className="h-4 w-4" />
                Needs review
                {(stats?.totalPending || 0) > 0 && (
                  <span className="text-[11px] text-muted-foreground">{stats?.totalPending}</span>
                )}
              </Button>
              <Button
                variant={isHistory ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
                onClick={() => setViewMode("HISTORY")}
              >
                <History className="h-4 w-4" />
                History
              </Button>
            </div>
            {isHistory && (
              <select
                aria-label="Filter approval history by status"
                value={historyStatusFilter}
                onChange={(event) =>
                  setHistoryStatusFilter(event.target.value as ApprovalStatus)
                }
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary sm:w-[180px]"
              >
                <option value="ALL">All resolved</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="SUPERSEDED">Superseded</option>
              </select>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {categoryOptions.map((option) => (
              <Button
                key={option.key}
                variant={categoryTab === option.key ? "secondary" : "ghost"}
                size="sm"
                className="shrink-0"
                onClick={() => setCategoryTab(option.key)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search project, customer, milestone, or requester"
              aria-label="Search approvals"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {isLoading ? (
          <div>
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-28 animate-pulse border-t border-border/60 bg-muted/20 first:border-t-0" />
            ))}
          </div>
        ) : isError ? (
          <div className="px-5 py-14 text-center">
            <p className="font-medium text-destructive">Unable to load approvals.</p>
            <p className="mt-1 text-xs text-muted-foreground">Refresh the page and try again.</p>
          </div>
        ) : displayedApprovals.length === 0 ? (
          <div className="px-5 py-14 text-center">
            {isHistory ? (
              <History className="mx-auto h-8 w-8 text-muted-foreground" />
            ) : (
              <CheckCircle2 className="mx-auto h-8 w-8 text-muted-foreground" />
            )}
            <p className="mt-3 font-medium text-foreground">
              {isHistory ? "No matching review history" : "Review queue is clear"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isHistory
                ? "Adjust the filters to find another approval record."
                : "New workflow decisions will appear here when they are submitted."}
            </p>
          </div>
        ) : (
          <div>
            {groupedApprovals.map((group) => (
              <div key={group.category} className="border-t border-border/60 first:border-t-0">
                <div className="flex items-center gap-2 bg-muted/20 px-4 py-2.5 sm:px-5">
                  <ApprovalCategoryIcon category={group.category} />
                  <h2 className="text-xs font-semibold uppercase text-muted-foreground">
                    {getApprovalTypeDisplay(group.category)}
                  </h2>
                  <span className="text-xs text-muted-foreground">{group.items.length}</span>
                </div>
                {group.items.map((item) => (
                  <ApprovalRow
                    key={`${item.category}-${item.id}`}
                    item={item}
                    canReview={canReview}
                    onOpenProject={() => {
                      if (item.projectId) router.push(`/projects/${item.projectId}`);
                    }}
                    onOpenAction={openAction}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <ApprovalActionDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        item={selectedItem}
        initialAction={initialAction}
      />
    </div>
  );
}

function ApprovalRow({
  item,
  canReview,
  onOpenProject,
  onOpenAction,
}: {
  item: ApprovalItem;
  canReview: boolean;
  onOpenProject: () => void;
  onOpenAction: (item: ApprovalItem, action: "APPROVE" | "REJECT") => void;
}) {
  const isClickable = Boolean(item.projectId);

  return (
    <div
      className={`border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5 ${isClickable ? "cursor-pointer transition-colors hover:bg-muted/15" : ""}`}
      role={isClickable ? "link" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={isClickable ? `Open project ${item.projectName}` : undefined}
      onClick={() => {
        if (isClickable) onOpenProject();
      }}
      onKeyDown={(event) => {
        if (
          !isClickable ||
          event.target !== event.currentTarget ||
          (event.key !== "Enter" && event.key !== " ")
        ) {
          return;
        }
        event.preventDefault();
        onOpenProject();
      }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={item.status} />
            {item.stepOrder != null && (
              <Badge variant="outline">Step {item.stepOrder}</Badge>
            )}
          </div>
          <h3 className="mt-2 font-semibold text-foreground">{item.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.projectName} | {item.clientName} | Requested by {item.submittedBy || "Unknown"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(item.requestedAt || item.submittedAt)}
          </p>
          <ApprovalSummary item={item} />
        </div>

        <div
          className="flex shrink-0 flex-wrap gap-2"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {item.status === "PENDING" && item.isCurrentApproval !== false && canReview ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-destructive"
                onClick={() => onOpenAction(item, "REJECT")}
              >
                <X className="h-3.5 w-3.5" />
                Reject
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                onClick={() => onOpenAction(item, "APPROVE")}
              >
                <Check className="h-3.5 w-3.5" />
                Approve
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => onOpenAction(item, "APPROVE")}
            >
              <Eye className="h-3.5 w-3.5" />
              View details
            </Button>
          )}
        </div>
      </div>
    </div>
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
      return <Badge variant="warning">Pending review</Badge>;
  }
}

function ApprovalSummary({ item }: { item: ApprovalItem }) {
  if (item.category === "PROJECT_PLAN") {
    return (
      <div className="mt-3 border-l-2 border-border pl-3 text-xs text-muted-foreground">
        <p>
          {item.requestNote
            ? <>Plan note: <strong className="font-medium text-foreground">&quot;{item.requestNote}&quot;</strong></>
            : "Initial project timeline submitted for sign-off."}
        </p>
        {item.reviewNote && (
          <p className="mt-1">
            Review note: <strong className="font-medium text-foreground">&quot;{item.reviewNote}&quot;</strong>
          </p>
        )}
      </div>
    );
  }

  if (item.category === "DEADLINE") {
    return (
      <div className="mt-3 grid gap-3 border-l-2 border-border pl-3 text-xs sm:grid-cols-2">
        <DeadlineMini title="Current timeline" deadline={item.currentDeadline} />
        <DeadlineMini title="Proposed change" deadline={item.proposedDeadline} />
      </div>
    );
  }

  if (item.category === "SUBMISSION") {
    return (
      <div className="mt-3 border-l-2 border-border pl-3 text-xs text-muted-foreground">
        <p>
          {item.milestoneName || "Milestone work"} submitted for review
          {item.stepOrder ? ` at step ${item.stepOrder}` : ""}.
        </p>
        {item.submissionNote && (
          <p className="mt-1">
            Submission note: <strong className="font-medium text-foreground">&quot;{item.submissionNote}&quot;</strong>
          </p>
        )}
        {item.reviewNote && (
          <p className="mt-1">
            Review feedback: <strong className="font-medium text-foreground">&quot;{item.reviewNote}&quot;</strong>
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
    <div>
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-0.5 text-muted-foreground">
        {formatDate(deadline?.start_date)} | {deadline?.duration_working_days || "-"} days | Due{" "}
        {formatDate(deadline?.due_date)}
      </p>
      {deadline?.change_reason && (
        <p className="mt-1 text-muted-foreground">Reason: &quot;{deadline.change_reason}&quot;</p>
      )}
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Date unavailable";
  return new Date(value).toLocaleDateString("id-ID", { dateStyle: "medium" });
}

function ApprovalCategoryIcon({ category }: { category: ApprovalItem["category"] }) {
  if (category === "DEADLINE") {
    return <CalendarClock className="h-3.5 w-3.5 text-amber-400" />;
  }
  if (category === "SUBMISSION") {
    return <FileCheck2 className="h-3.5 w-3.5 text-emerald-400" />;
  }
  return <ClipboardCheck className="h-3.5 w-3.5 text-primary" />;
}
