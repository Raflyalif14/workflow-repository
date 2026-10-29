"use client";
import { useLanguage } from "@/components/i18n/language-provider";

import { translate as translateI18n } from "@/i18n";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, ClipboardList, Files, History, Inbox, Search } from "lucide-react";
import { ListSummary } from '@/components/list-summary';
import { ApprovalRow } from "@/components/approvals/approval-row";
import { ApprovalActionDialog } from "@/components/approvals/approval-action-dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { RoleGuard } from "@/components/auth/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApprovalOverview } from "@/hooks/use-approvals";
import { approvalQueuePage, outputReviewHref } from "@/lib/approval-queue";
import { canReadApprovalOverview } from "@/lib/approval-overview-access";
import { ApprovalCategory, ApprovalItem, ApprovalStatus } from "@/types/approval";

const categoryOptions: Array<{ key: ApprovalCategory; label: "approvalUi.allRequests" | "approvalUi.projectPlans" | "approvalUi.deadlineChanges" | "outputQueue.category" }> = [
  { key: "ALL", label: "approvalUi.allRequests" },
  { key: "PROJECT_PLAN", label: "approvalUi.projectPlans" },
  { key: "DEADLINE", label: "approvalUi.deadlineChanges" },
  { key: "OUTPUT_DOCUMENT", label: "outputQueue.category" },
];

export default function ApprovalCenterPage() {
  useLanguage();
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "HEAD_SA"]}>
      <ApprovalCenterPageContent />
    </RoleGuard>
  );
}

function ApprovalCenterPageContent() {
  const { locale } = useLanguage();
  const router = useRouter();
  const { user } = useAuth();
  const canLoadApprovalOverview = canReadApprovalOverview(user?.role);
  const [viewMode, setViewMode] = useState<"NEEDS_REVIEW" | "HISTORY">("NEEDS_REVIEW");
  const [categoryTab, setCategoryTab] = useState<ApprovalCategory>("ALL");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<ApprovalStatus>("ALL");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<ApprovalItem | null>(null);
  const [initialAction, setInitialAction] = useState<"APPROVE" | "REJECT" | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [page, setPage] = useState(1);
  const overview = useApprovalOverview(canLoadApprovalOverview);
  const stats = overview.data?.stats;
  const { isLoading, isError, isFetching } = overview;
  const effectiveStatus: ApprovalStatus =
    viewMode === "NEEDS_REVIEW" ? "PENDING" : historyStatusFilter;
  const canReview = user?.role === "HEAD_SA";
  const isHistory = viewMode === "HISTORY";
  const queuePage = useMemo(() => approvalQueuePage(overview.data?.items || [], {
    type: categoryTab, status: effectiveStatus, search,
  }, isHistory, page, 20, locale), [overview.data, categoryTab, effectiveStatus, search, isHistory, page, locale]);
  const displayedApprovals = queuePage.items;
  const snapshot = [
    { label: translateI18n("approvalUi.totalPending"), value: stats?.totalPending ?? "\u2014", scope: translateI18n('listSummary.pending'), icon: Inbox, primary: true },
    { label: translateI18n("listSummary.approvalPlans"), value: stats?.pendingProjectPlans ?? "\u2014", scope: translateI18n('listSummary.pending'), icon: ClipboardList },
    { label: translateI18n("listSummary.approvalDeadlines"), value: stats?.pendingDeadlines ?? "\u2014", scope: translateI18n('listSummary.pending'), icon: CalendarClock },
    { label: translateI18n("listSummary.approvalOutputs"), value: stats?.pendingDocs ?? "\u2014", scope: translateI18n('listSummary.pending'), icon: Files },
  ];

  const openAction = (item: ApprovalItem, action: "APPROVE" | "REJECT") => {
    setSelectedItem(item);
    setInitialAction(action);
    setIsDialogOpen(true);
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-6 sm:px-6 xl:px-8">
      <header className="border-b border-border/60 pb-5">
        <p className="text-xs font-semibold uppercase text-primary">
          {translateI18n(canReview ? "approvalUi.headWorkspace" : "approvalUi.oversight")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">
          {translateI18n(canReview ? "approvalUi.reviewQueue" : "approvalUi.approvalCenter")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {canReview
            ? translateI18n("outputQueue.description")
            : translateI18n("approvalUi.oversightDescription")}
        </p>
      </header>

      {isError && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
        <span>{translateI18n(overview.data ? "outputQueue.stale" : "approval.loadError")}</span>
        <Button variant="outline" size="sm" disabled={isFetching || !canLoadApprovalOverview} onClick={() => { if (canLoadApprovalOverview) void overview.refetch(); }}>{translateI18n("outputQueue.retry")}</Button>
      </div>}
      <ListSummary aria-label={translateI18n('approvalUi.snapshot')} description={translateI18n('listSummary.approvalHelp')}
        items={snapshot} loading={isLoading} hasError={isError} refreshing={isFetching && !isLoading} />

      <section className="overflow-hidden page-surface">
        <div className="space-y-4 border-b border-border/60 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              <Button
                variant={!isHistory ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
                onClick={() => {
                  setPage(1);
                  setViewMode("NEEDS_REVIEW");
                  setHistoryStatusFilter("ALL");
                }}
              >
                <Inbox className="h-4 w-4" />
                {translateI18n("approvalUi.needsReview")}
                {(stats?.totalPending ?? 0) > 0 && (
                  <span className="text-[11px] text-muted-foreground">{stats?.totalPending}</span>
                )}
              </Button>
              <Button
                variant={isHistory ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
                onClick={() => { setPage(1); setViewMode("HISTORY"); }}
              >
                <History className="h-4 w-4" />
                {translateI18n("approvalUi.history")}
              </Button>
            </div>
            {isHistory && (
              <select
                aria-label={translateI18n("approvalUi.historyFilter")}
                value={historyStatusFilter}
                onChange={(event) => { setPage(1); setHistoryStatusFilter(event.target.value as ApprovalStatus); }}
                className="h-10 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 sm:w-[180px]"
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
                aria-pressed={categoryTab === option.key}
                className={categoryTab === option.key ? "shrink-0 bg-primary-soft text-primary" : "shrink-0"}
                onClick={() => { setPage(1); setCategoryTab(option.key); }}
              >
                {translateI18n(option.label)}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{isHistory ? translateI18n("outputQueue.historyScope") : null}</span>
            <Button size="sm" variant="ghost" disabled={isFetching || !canLoadApprovalOverview} onClick={() => { if (canLoadApprovalOverview) void overview.refetch(); }}>{translateI18n("outputQueue.refresh")}</Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={translateI18n("approvalUi.searchPlaceholder")}
              aria-label={translateI18n("approvalUi.search")}
              value={search}
              onChange={(event) => { setPage(1); setSearch(event.target.value); }}
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
        ) : isError && !overview.data ? (
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
            {displayedApprovals.map(item => (
              <ApprovalRow key={`${item.category}-${item.id}`} item={item} canReview={canReview}
                onOpenProject={() => { if (item.projectId) router.push(item.category === "OUTPUT_DOCUMENT" ? outputReviewHref(item) : `/projects/${item.projectId}`); }}
                onOpenAction={openAction} />
            ))}
          </div>
        )}
        {overview.data && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 p-4 text-xs text-muted-foreground">
          <span>{translateI18n("outputQueue.page", { page: queuePage.page, pages: queuePage.pages, count: queuePage.total })}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={queuePage.page <= 1} onClick={() => setPage(queuePage.page - 1)}>{translateI18n("outputQueue.previous")}</Button>
            <Button variant="outline" size="sm" disabled={queuePage.page >= queuePage.pages} onClick={() => setPage(queuePage.page + 1)}>{translateI18n("outputQueue.next")}</Button>
          </div>
        </div>}
      </section>

      <ApprovalActionDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        item={selectedItem}
        initialAction={initialAction}
        canReview={canReview}
      />
    </div>
  );
}
