"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  CalendarClock,
  Layers,
  FileText,
  Search,
  Filter,
  ArrowUpRight,
  Eye,
  Check,
  X,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useApprovals, useApprovalStats } from "@/hooks/use-approvals";
import { ApprovalItem, ApprovalCategory, ApprovalStatus } from "@/types/approval";
import { ApprovalActionDialog } from "@/components/approvals/approval-action-dialog";

import { RoleGuard } from "@/components/auth/role-guard";

export default function ApprovalCenterPage() {
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "HEAD_SA"]}>
      <ApprovalCenterPageContent />
    </RoleGuard>
  );
}

function ApprovalCenterPageContent() {
  const [categoryTab, setCategoryTab] = useState<ApprovalCategory>("ALL");
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus>("PENDING");
  const [search, setSearch] = useState("");

  // Dialog State
  const [selectedItem, setSelectedItem] = useState<ApprovalItem | null>(null);
  const [initialAction, setInitialAction] = useState<"APPROVE" | "REJECT" | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: stats } = useApprovalStats();
  const { data: approvals = [], isLoading, isError } = useApprovals({
    type: categoryTab,
    status: statusFilter,
    search,
  });

  const handleOpenAction = (item: ApprovalItem, action: "APPROVE" | "REJECT") => {
    setSelectedItem(item);
    setInitialAction(action);
    setIsDialogOpen(true);
  };

  const handleOpenReview = (item: ApprovalItem) => {
    setSelectedItem(item);
    setInitialAction("APPROVE");
    setIsDialogOpen(true);
  };

  const getCategoryIcon = (category: "DEADLINE" | "MILESTONE" | "DOCUMENT") => {
    switch (category) {
      case "DEADLINE":
        return <CalendarClock className="h-4 w-4 text-amber-400" />;
      case "MILESTONE":
        return <Layers className="h-4 w-4 text-primary" />;
      case "DOCUMENT":
        return <FileText className="h-4 w-4 text-blue-400" />;
    }
  };

  return (
    <div className="container py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/50 pb-6">
        <div>
          <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider mb-1">
            <ShieldCheck className="h-4 w-4" />
            <span>Head Solution Architect Portal</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Approval Center</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Centralized sign-off console for project deadlines, milestone advancement, and technical deliverables.
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Pending
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats?.totalPending || 0}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Awaiting your sign-off</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Milestone Sign-Offs
            </CardTitle>
            <Layers className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pendingMilestones || 0}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Workflow stages</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Document Deliverables
            </CardTitle>
            <FileText className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pendingDocs || 0}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Proposals & sizing sheets</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Deadline Extensions
            </CardTitle>
            <CalendarClock className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pendingDeadlines || 0}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Postpone requests</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs & Search Filter */}
      <div className="space-y-4">
        {/* Category Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-border/60 pb-2 overflow-x-auto">
          {[
            { key: "ALL", label: "All Requests", count: stats?.totalPending },
            { key: "DEADLINE", label: "Deadlines", count: stats?.pendingDeadlines },
            { key: "MILESTONE", label: "Milestones", count: stats?.pendingMilestones },
            { key: "DOCUMENT", label: "Documents", count: stats?.pendingDocs },
          ].map((tab) => (
            <Button
              key={tab.key}
              variant={categoryTab === tab.key ? "default" : "ghost"}
              size="sm"
              className="gap-2 text-xs h-8"
              onClick={() => setCategoryTab(tab.key as any)}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${categoryTab === tab.key ? "bg-background text-foreground" : "bg-primary/20 text-primary"
                    }`}
                >
                  {tab.count}
                </span>
              )}
            </Button>
          ))}
        </div>

        {/* Search & Status Row */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-8 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by project, client, title, or submitter..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="sm:col-span-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="PENDING">Pending Review Only</option>
              <option value="APPROVED">Approved History</option>
              <option value="REJECTED">Rejected History</option>
              <option value="ALL">All Statuses</option>
            </select>
          </div>
        </div>
      </div>

      {/* Approvals List */}
      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">Loading approval requests...</div>
      ) : isError ? (
        <div className="py-16 text-center text-destructive">Failed to load approvals.</div>
      ) : approvals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground space-y-2">
          <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto" />
          <p className="text-foreground font-semibold">All Caught Up!</p>
          <p className="text-xs">There are no pending approvals requiring your attention.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((item) => (
            <Card
              key={item.id}
              className="hover:border-primary/40 transition duration-200 p-4"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                {/* Left: Info */}
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                      {getCategoryIcon(item.category)}
                      <span>{item.category}</span>
                    </span>
                    <Badge variant="outline" className="text-[11px] font-mono">
                      {item.projectCode}
                    </Badge>
                    <Badge
                      variant={
                        item.status === "APPROVED"
                          ? "success"
                          : item.status === "REJECTED"
                            ? "destructive"
                            : "warning"
                      }
                      className="text-[10px]"
                    >
                      {item.status}
                    </Badge>
                  </div>

                  <h3 className="text-base font-bold text-foreground hover:text-primary transition cursor-pointer" onClick={() => handleOpenReview(item)}>
                    {item.title}
                  </h3>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    <span>Customer: <strong className="text-foreground">{item.clientName}</strong></span>
                    <span>•</span>
                    <span>Submitted by: <strong className="text-foreground">{item.submittedBy}</strong></span>
                    <span>•</span>
                    <span>{new Date(item.submittedAt).toLocaleDateString("id-ID", { dateStyle: "medium" })}</span>
                  </div>

                  {item.feedback && (
                    <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded border border-border/40 mt-2">
                      <span className="font-semibold text-foreground">Feedback/Reason: </span>
                      {item.feedback}
                    </div>
                  )}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 shrink-0 self-start md:self-center">
                  {item.status === "PENDING" ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => handleOpenAction(item, "REJECT")}
                      >
                        <X className="h-3.5 w-3.5" />
                        <span>Reject</span>
                      </Button>
                      <Button
                        size="sm"
                        className="gap-1.5 h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
                        onClick={() => handleOpenAction(item, "APPROVE")}
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Approve</span>
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 h-8 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => handleOpenReview(item)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>View Record</span>
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Decision Dialog */}
      <ApprovalActionDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        item={selectedItem}
        initialAction={initialAction}
      />
    </div>
  );
}
