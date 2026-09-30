"use client";
import { useLanguage } from "@/components/i18n/language-provider";

import { translate as translateI18n, getIntlLocale } from "@/i18n";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Eye,
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
import { ApprovalCategory, ApprovalItem, ApprovalStatus } from "@/types/approval";

const categoryOptions: Array<{ key: ApprovalCategory; label: "approvalUi.allRequests" | "approvalUi.projectPlans" | "approvalUi.deadlineChanges" }> = [
  { key: "ALL", label: "approvalUi.allRequests" },
  { key: "PROJECT_PLAN", label: "approvalUi.projectPlans" },
  { key: "DEADLINE", label: "approvalUi.deadlineChanges" },
];

const categoryOrder: ApprovalItem["category"][] = ["PROJECT_PLAN", "DEADLINE"];

export default function ApprovalCenterPage() {
  useLanguage();
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
    { label: translateI18n("approvalUi.totalPending"), value: stats?.totalPending || 0 },
    { label: translateI18n("approvalUi.projectPlans"), value: stats?.pendingProjectPlans || 0 },
    { label: translateI18n("approvalUi.deadlineChanges"), value: stats?.pendingDeadlines || 0 },
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
          {translateI18n(canReview ? "approvalUi.headWorkspace" : "approvalUi.oversight")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">
          {translateI18n(canReview ? "approvalUi.reviewQueue" : "approvalUi.approvalCenter")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {canReview
            ? translateI18n("approvalUi.headDescription")
            : translateI18n("approvalUi.oversightDescription")}
        </p>
      </header>

      <section
        aria-label={translateI18n("approvalUi.snapshot")}
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
                {translateI18n("approvalUi.needsReview")}
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
                {translateI18n("approvalUi.history")}
              </Button>
            </div>
            {isHistory && (
              <select
                aria-label={translateI18n("approvalUi.historyFilter")}
                value={historyStatusFilter}
                onChange={(event) =>
                  setHistoryStatusFilter(event.target.value as ApprovalStatus)
                }
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary sm:w-[180px]"
              >
                <option value="ALL">{translateI18n("copy.allResolved")}</option>
                <option value="APPROVED">{translateI18n("milestoneStatus.APPROVED")}</option>
                <option value="REJECTED">{translateI18n("approvalStatus.REJECTED")}</option>
                <option value="SUPERSEDED">{translateI18n("documentStatus.SUPERSEDED")}</option>
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
                {translateI18n(option.label)}
              </Button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={translateI18n("approvalUi.searchPlaceholder")}
              aria-label={translateI18n("approvalUi.search")}
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
            <p className="font-medium text-destructive">{translateI18n("approval.loadError")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{translateI18n("copy.refreshTryAgain")}</p>
          </div>
        ) : displayedApprovals.length === 0 ? (
          <div className="px-5 py-14 text-center">
            {isHistory ? (
              <History className="mx-auto h-8 w-8 text-muted-foreground" />
            ) : (
              <CheckCircle2 className="mx-auto h-8 w-8 text-muted-foreground" />
            )}
            <p className="mt-3 font-medium text-foreground">
              {translateI18n(isHistory ? "approvalUi.noHistory" : "approvalUi.queueClear")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isHistory
                ? translateI18n("approvalUi.adjustFilters")
                : translateI18n("approvalUi.newDecisions")}
            </p>
          </div>
        ) : (
          <div>
            {groupedApprovals.map((group) => (
              <div key={group.category} className="border-t border-border/60 first:border-t-0">
                <div className="flex items-center gap-2 bg-muted/20 px-4 py-2.5 sm:px-5">
                  <ApprovalCategoryIcon category={group.category} />
                  <h2 className="text-xs font-semibold uppercase text-muted-foreground">
                    {translateI18n(group.category === "PROJECT_PLAN" ? "approvalUi.projectPlans" : "approvalUi.deadlineChanges")}
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
      aria-label={isClickable ? translateI18n("approvalUi.openProject", { name: item.projectName }) : undefined}
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
              <Badge variant="outline">{translateI18n("approvalUi.step", { number: item.stepOrder })}</Badge>
            )}
          </div>
          <h3 className="mt-2 font-semibold text-foreground">{item.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {translateI18n("approvalUi.requestedSummary", { project: item.projectName, customer: item.clientName, name: item.submittedBy || translateI18n("approvalUi.unknown") })}
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
                {translateI18n("common.reject")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                onClick={() => onOpenAction(item, "APPROVE")}
              >
                <Check className="h-3.5 w-3.5" />
                {translateI18n("common.approve")}
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
              {translateI18n("approvalUi.viewDetails")}
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
      return <Badge variant="success">{translateI18n("milestoneStatus.APPROVED")}</Badge>;
    case "REJECTED":
      return <Badge variant="destructive">{translateI18n("approvalStatus.REJECTED")}</Badge>;
    case "SUPERSEDED":
      return <Badge variant="outline">{translateI18n("documentStatus.SUPERSEDED")}</Badge>;
    default:
      return <Badge variant="warning">{translateI18n("approvalStatus.PENDING")}</Badge>;
  }
}

function ApprovalSummary({ item }: { item: ApprovalItem }) {
  if (item.category === "PROJECT_PLAN") {
    return (
      <div className="mt-3 border-l-2 border-border pl-3 text-xs text-muted-foreground">
        <p>
          {item.requestNote
            ? <>{translateI18n("copy.planNote")} <strong className="font-medium text-foreground">&quot;{item.requestNote}&quot;</strong></>
            : translateI18n("approvalUi.initialTimeline")}
        </p>
        {item.reviewNote && (
          <p className="mt-1">
            {translateI18n("copy.reviewNoteLabel")} <strong className="font-medium text-foreground">&quot;{item.reviewNote}&quot;</strong>
          </p>
        )}
      </div>
    );
  }

  if (item.category === "DEADLINE") {
    return (
      <div className="mt-3 grid gap-3 border-l-2 border-border pl-3 text-xs sm:grid-cols-2">
        <DeadlineMini title={translateI18n("approvalUi.currentTimeline")} deadline={item.currentDeadline} />
        <DeadlineMini title={translateI18n("approvalUi.proposedChange")} deadline={item.proposedDeadline} />
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
        {translateI18n("approvalUi.deadlineSummary", { start: formatDate(deadline?.start_date), days: deadline?.duration_working_days || "-", due: formatDate(deadline?.due_date) })}
      </p>
      {deadline?.change_reason && (
        <p className="mt-1 text-muted-foreground">{translateI18n("approvalUi.reason", { reason: deadline.change_reason })}</p>
      )}
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return translateI18n("approvalUi.dateUnavailable");
  return new Date(value).toLocaleDateString(getIntlLocale(), { dateStyle: "medium" });
}

function ApprovalCategoryIcon({ category }: { category: ApprovalItem["category"] }) {
  if (category === "DEADLINE") {
    return <CalendarClock className="h-3.5 w-3.5 text-amber-400" />;
  }
  return <ClipboardCheck className="h-3.5 w-3.5 text-primary" />;
}
