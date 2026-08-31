"use client";

import { ReactNode, useState } from "react";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileCheck2,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { RoleGuard } from "@/components/auth/role-guard";
import { useAuth } from "@/components/auth/auth-provider";
import { ApprovalActionDialog } from "@/components/approvals/approval-action-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useApprovals, useApprovalStats } from "@/hooks/use-approvals";
import { ApprovalCategory, ApprovalItem, ApprovalStatus } from "@/types/approval";

export default function ApprovalCenterPage() {
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "HEAD_SA"]}>
      <ApprovalCenterPageContent />
    </RoleGuard>
  );
}

function ApprovalCenterPageContent() {
  const { user } = useAuth();
  const [categoryTab, setCategoryTab] = useState<ApprovalCategory>("ALL");
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus>("PENDING");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<ApprovalItem | null>(null);
  const [initialAction, setInitialAction] = useState<"APPROVE" | "REJECT" | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: stats } = useApprovalStats();
  const { data: approvals = [], isLoading, isError } = useApprovals({
    type: categoryTab,
    status: statusFilter,
    search,
  });
  const canReview = user?.role === "HEAD_SA";

  const openAction = (item: ApprovalItem, action: "APPROVE" | "REJECT") => {
    setSelectedItem(item);
    setInitialAction(action);
    setIsDialogOpen(true);
  };

  return (
    <div className="container space-y-8 py-8">
      <div className="flex flex-col gap-4 border-b border-border/50 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <ShieldCheck className="h-4 w-4" />
            Head Solution Architect Portal
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Approval Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review project plans, active deadline changes, and SA submissions.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Metric title="Total Pending" value={stats?.totalPending || 0} icon={<ShieldCheck className="h-4 w-4 text-primary" />} />
        <Metric title="Deadline Proposals" value={stats?.pendingDeadlines || 0} icon={<CalendarClock className="h-4 w-4 text-amber-400" />} />
        <Metric title="Project Plans" value={stats?.pendingProjectPlans || 0} icon={<ClipboardCheck className="h-4 w-4 text-primary" />} />
        <Metric title="SA Submissions" value={stats?.pendingSubmissions || 0} icon={<FileCheck2 className="h-4 w-4 text-emerald-400" />} />
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 overflow-x-auto border-b border-border/60 pb-2">
          {[
            { key: "ALL", label: "All Requests", count: stats?.totalPending },
            { key: "DEADLINE", label: "Deadlines", count: stats?.pendingDeadlines },
            { key: "PROJECT_PLAN", label: "Project Plans", count: stats?.pendingProjectPlans },
            { key: "SUBMISSION", label: "Submission", count: stats?.pendingSubmissions },
          ].map((tab) => (
            <Button
              key={tab.key}
              variant={categoryTab === tab.key ? "default" : "ghost"}
              size="sm"
              className="h-8 gap-2 text-xs"
              onClick={() => setCategoryTab(tab.key as ApprovalCategory)}
            >
              <span>{tab.label}</span>
              {Boolean(tab.count) && (
                <span className={categoryTab === tab.key ? "rounded-full bg-background px-1.5 py-0.5 text-[10px] text-foreground" : "rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary"}>
                  {tab.count}
                </span>
              )}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="relative sm:col-span-8">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search project, customer, milestone, requester..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as ApprovalStatus)}
            className="flex h-9 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary sm:col-span-4"
          >
            <option value="PENDING">Pending Review Only</option>
            <option value="APPROVED">Approved History</option>
            <option value="REJECTED">Rejected History</option>
            <option value="SUPERSEDED">Superseded History</option>
            <option value="ALL">All Statuses</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">Loading approval requests...</div>
      ) : isError ? (
        <div className="py-16 text-center text-destructive">Failed to load approvals.</div>
      ) : approvals.length === 0 ? (
        <div className="space-y-2 rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
          <p className="font-semibold text-foreground">All Caught Up</p>
          <p className="text-xs">No matching project-plan, deadline, or submission requests.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((item) => (
            <Card key={`${item.category}-${item.id}`} className="p-4 hover:border-primary/40">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                      <ApprovalCategoryIcon category={item.category} />
                      {item.category}
                    </span>
                    {item.stepOrder && (
                      <Badge variant="outline" className="text-[11px] font-mono">
                        Step {item.stepOrder}
                      </Badge>
                    )}
                    <StatusBadge status={item.status} />
                  </div>
                  <h3 className="text-base font-bold text-foreground">{item.title}</h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>Project: <strong className="text-foreground">{item.projectName}</strong></span>
                    <span>Customer: <strong className="text-foreground">{item.clientName}</strong></span>
                    <span>Requested by: <strong className="text-foreground">{item.submittedBy}</strong></span>
                    <span>{new Date(item.submittedAt).toLocaleDateString("id-ID", { dateStyle: "medium" })}</span>
                  </div>
                  <ApprovalSummary item={item} />
                </div>

                <div className="flex shrink-0 items-center gap-2 self-start md:self-center">
                  {item.status === "PENDING" && item.isCurrentApproval !== false && canReview ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 border-destructive/30 text-xs text-destructive hover:bg-destructive/10"
                        onClick={() => openAction(item, "REJECT")}
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 gap-1.5 bg-emerald-500 text-xs font-semibold text-black hover:bg-emerald-600"
                        onClick={() => openAction(item, "APPROVE")}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Approve
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => openAction(item, "APPROVE")}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
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

function Metric({ title, value, icon }: { title: string; value: number; icon: ReactNode }) {
  return (
    <Card className="bg-card/50">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-primary">{value}</div>
        <p className="mt-0.5 text-xs text-muted-foreground">Awaiting review</p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: ApprovalStatus }) {
  if (status === "APPROVED") return <Badge variant="success">APPROVED</Badge>;
  if (status === "REJECTED") return <Badge variant="destructive">REJECTED</Badge>;
  if (status === "SUPERSEDED") return <Badge variant="outline">SUPERSEDED</Badge>;
  return <Badge variant="warning">PENDING</Badge>;
}

function ApprovalSummary({ item }: { item: ApprovalItem }) {
  if (item.category === "PROJECT_PLAN") {
    return (
      <div className="mt-2 rounded-lg border border-border/40 bg-muted/30 p-2 text-xs text-muted-foreground">
        {item.requestNote ? <>Plan note: <strong className="text-foreground">{item.requestNote}</strong></> : "Initial timeline is ready for review."}
        {item.reviewNote ? <>{" | "}Review: <strong className="text-foreground">{item.reviewNote}</strong></> : null}
      </div>
    );
  }

  if (item.category === "DEADLINE") {
    return (
      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
        <DeadlineMini title="Effective Deadline" deadline={item.currentDeadline} />
        <DeadlineMini title="Proposed Deadline" deadline={item.proposedDeadline} />
      </div>
    );
  }

  if (item.category === "SUBMISSION") {
    return (
      <div className="mt-2 rounded-lg border border-border/40 bg-muted/30 p-2 text-xs text-muted-foreground">
        SA: <strong className="text-foreground">{item.submittedBy}</strong>
        {" | "}
        Submitted: <strong className="text-foreground">{formatDate(item.submittedAt)}</strong>
        {item.submissionNote ? <>{" | "}Note: <strong className="text-foreground">{item.submissionNote}</strong></> : null}
        {item.reviewNote ? <>{" | "}Review: <strong className="text-foreground">{item.reviewNote}</strong></> : null}
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
  deadline?: { start_date?: string | null; duration_working_days?: number | null; due_date?: string | null; change_reason?: string | null } | null;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/30 p-2">
      <p className="font-semibold text-foreground">{title}</p>
      <p>Start: {formatDate(deadline?.start_date)}</p>
      <p>Duration: {deadline?.duration_working_days || "-"} working days</p>
      <p>Due: {formatDate(deadline?.due_date)}</p>
      {deadline?.change_reason && <p>Reason: {deadline.change_reason}</p>}
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("id-ID", { dateStyle: "medium" });
}

function formatPicRequirement(item: ApprovalItem) {
  if (item.stageDefaultRole !== "SA") return "Not Required";
  return item.pic?.full_name || item.pic?.fullName || "-";
}

function ApprovalCategoryIcon({ category }: { category: ApprovalItem["category"] }) {
  if (category === "DEADLINE") return <CalendarClock className="h-4 w-4 text-amber-400" />;
  if (category === "SUBMISSION") return <FileCheck2 className="h-4 w-4 text-emerald-400" />;
  return <ClipboardCheck className="h-4 w-4 text-primary" />;
}
