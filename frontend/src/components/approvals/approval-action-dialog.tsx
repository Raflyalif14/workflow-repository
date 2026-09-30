"use client";

import { translate as translateI18n, translateStoredError, translateRole, getIntlLocale } from "@/i18n";
import { useLanguage } from "@/components/i18n/language-provider";

import React, { useState } from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useProcessApproval } from "@/hooks/use-approvals";
import { useProject, useSolutionArchitects } from "@/hooks/use-projects";
import { ApprovalItem } from "@/types/approval";
import {
  CheckCircle2,
  XCircle,
  CalendarClock,
  ClipboardCheck,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ApprovalActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ApprovalItem | null;
  initialAction?: "APPROVE" | "REJECT" | null;
}

export function ApprovalActionDialog({
  open,
  onOpenChange,
  item,
  initialAction = "APPROVE",
}: ApprovalActionDialogProps) {
  useLanguage();
  const processMutation = useProcessApproval();
  const projectQuery = useProject(item?.category === "PROJECT_PLAN" ? item.projectId : "");

  const [action, setAction] = useState<"APPROVE" | "REJECT">(initialAction || "APPROVE");
  const [feedback, setFeedback] = useState("");
  const [picId, setPicId] = useState("");
  const [error, setError] = useState("");

  const isProjectPlanApproval = item?.category === "PROJECT_PLAN" && action === "APPROVE";
  const workflowModel = projectQuery.data?.scenario?.workflow_model;
  const workflowVersion = projectQuery.data?.scenario?.workflow_version;
  const isOperationalV2 = workflowModel === "OPERATIONAL_V2" && workflowVersion === 2;
  const isLegacy = workflowModel === "LEGACY" && workflowVersion === 1;
  const requiresPic = isProjectPlanApproval && isOperationalV2;
  const projectModelUnavailable = isProjectPlanApproval && (projectQuery.isLoading || projectQuery.isError || (!isLegacy && !isOperationalV2));
  const { data: pics = [], isLoading: picsLoading, isError: picsError } = useSolutionArchitects(
    open && requiresPic
  );

  // Sync action state when dialog opens or initialAction prop changes
  React.useEffect(() => {
    if (initialAction) {
      setAction(initialAction);
    }
    if (!open) {
      setFeedback("");
      setPicId("");
      setError("");
    }
  }, [initialAction, open]);

  React.useEffect(() => {
    setPicId("");
  }, [action, item?.id]);

  if (!item) return null;

  const isPending = item.status === "PENDING";
  const canProcess = isPending && item.isCurrentApproval !== false;

  const handleDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canProcess) return;

    if (action === "REJECT" && (!feedback.trim() || feedback.trim().length < 5)) {
      setError("approvalDialog.reasonMin");
      return;
    }
    if (isProjectPlanApproval && projectModelUnavailable) {
      setError("approvalDialog.workflowFailed");
      return;
    }
    if (requiresPic && !picId) {
      setError("projectDetail.picBeforeApproval");
      return;
    }

    setError("");
    try {
      await processMutation.mutateAsync({
        item,
        action,
        feedback: feedback.trim() || undefined,
        picId: requiresPic ? picId : undefined,
      });
      onOpenChange(false);
      setFeedback("");
    } catch {
      setError("approvalDialog.processFailed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="mb-5 space-y-0">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
            {item.category === "DEADLINE" && <CalendarClock className="h-4 w-4 text-amber-400" />}
            {item.category === "PROJECT_PLAN" && <ClipboardCheck className="h-4 w-4" />}
          </span>
          <div className="min-w-0 space-y-1">
            <DialogTitle className="text-base font-semibold tracking-tight">{translateI18n("copy.headReview")}</DialogTitle>
            <DialogDescription className="mt-0 text-xs leading-relaxed">
              {translateI18n("approvalDialog.reviewFor", { project: item.projectName, customer: item.clientName })}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-4">
        {/* Ticket Summary Box */}
        <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4 text-xs shadow-sm">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="font-semibold">
              {translateI18n(item.category === "PROJECT_PLAN" ? "approvalUi.projectPlans" : "approvalUi.deadlineChanges")}
            </Badge>
            <span className="text-muted-foreground">
              {translateI18n("approvalDialog.submittedAt", { date: new Date(item.submittedAt).toLocaleString(getIntlLocale(), { dateStyle: "medium", timeStyle: "short" }) })}
            </span>
          </div>

          <h3 className="text-sm font-semibold tracking-tight text-foreground">{item.title}</h3>
          <p className="text-muted-foreground">{item.details}</p>

          {item.category === "DEADLINE" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <DeadlineBox title={translateI18n("approvalDialog.effectiveDeadline")} deadline={item.currentDeadline} />
              <DeadlineBox title={translateI18n("approvalDialog.proposedDeadline")} deadline={item.proposedDeadline} />
            </div>
          )}

          {item.category === "PROJECT_PLAN" && (
            <div className="space-y-1 rounded-xl border border-border/40 bg-card/70 p-3">
              <p>{translateI18n("copy.projectColon")} <strong className="text-foreground">{item.projectName}</strong></p>
              {item.requestNote && <p>{translateI18n("copy.planNote")} <strong className="text-foreground">&quot;{item.requestNote}&quot;</strong></p>}
              {item.reviewNote && <p>{translateI18n("copy.reviewNoteLabel")} <strong className="text-foreground">&quot;{item.reviewNote}&quot;</strong></p>}
            </div>
          )}


          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
            <span>{translateI18n("copy.requestedBy")} <strong className="text-foreground">{item.submittedBy}</strong></span>
            {item.deadline && (
              <span>{translateI18n("copy.targetLabel")} <strong className="text-foreground">{new Date(item.deadline).toLocaleDateString(getIntlLocale(), { dateStyle: "medium" })}</strong></span>
            )}
          </div>
        </div>

        {/* Decision Form */}
        {canProcess ? (
          <form onSubmit={handleDecision} className="space-y-3">
            <div className="flex flex-col gap-2 rounded-xl border border-border/40 bg-muted/10 p-1.5 sm:flex-row">
              <Button
                type="button"
                variant={action === "APPROVE" ? "default" : "outline"}
                className={`h-9 flex-1 gap-1.5 rounded-lg text-xs ${
                  action === "APPROVE" ? "bg-emerald-500 text-black font-semibold shadow-sm hover:bg-emerald-600" : ""
                }`}
                onClick={() => {
                  setAction("APPROVE");
                  setError("");
                }}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>{translateI18n("approval.approveRequest")}</span>
              </Button>
              <Button
                type="button"
                variant={action === "REJECT" ? "destructive" : "outline"}
                className="h-9 flex-1 gap-1.5 rounded-lg text-xs"
                onClick={() => {
                  setAction("REJECT");
                  setError("");
                }}
              >
                <XCircle className="h-4 w-4" />
                <span>{translateI18n("copy.rejectRevision")}</span>
              </Button>
            </div>

            {isProjectPlanApproval && (
              <div className="space-y-2">
                <label htmlFor="approval-project-plan-pic" className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {translateI18n("approvalDialog.pic")} {isOperationalV2 ? "*" : ""}
                </label>
                {projectQuery.isLoading ? (
                  <p className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                    {translateI18n("approvalDialog.loadingWorkflow")}
                  </p>
                ) : projectQuery.isError || (!isLegacy && !isOperationalV2) ? (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {translateI18n("approvalDialog.workflowFailed")}
                  </p>
                ) : isOperationalV2 && picsLoading ? (
                  <p className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                    {translateI18n("projectDetail.loadingEligible")}
                  </p>
                ) : isOperationalV2 && picsError ? (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {translateI18n("projectDetail.eligibleFailed")}
                  </p>
                ) : isOperationalV2 ? (
                  <select
                    id="approval-project-plan-pic"
                    value={picId}
                    onChange={(event) => {
                      setPicId(event.target.value);
                      setError("");
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    required
                  >
                    <option value="">{translateI18n("copy.selectSa")}</option>
                    {pics.map((pic) => (
                      <option key={pic.id} value={pic.id}>
                        {pic.full_name} ({translateRole(pic.role)}) - {pic.email}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="rounded-lg border border-border/40 bg-muted/15 px-3 py-2 text-xs text-muted-foreground">
                    {translateI18n("approvalDialog.legacyPic")}
                  </p>
                )}
              </div>
            )}

            <div>
              <label htmlFor="approval-feedback" className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {translateI18n(action === "REJECT" ? "approvalDialog.rejectionReason" : "approvalDialog.approvalRemarks")}
              </label>
              <textarea
                id="approval-feedback"
                rows={3}
                placeholder={
                  action === "REJECT"
                    ? translateI18n("approvalDialog.rejectionPlaceholder")
                    : translateI18n("approvalDialog.approvalPlaceholder")
                }
                value={feedback}
                onChange={(e) => {
                  setFeedback(e.target.value);
                  setError("");
                }}
                className="flex w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                required={action === "REJECT"}
                aria-invalid={Boolean(error) && action === "REJECT"}
                aria-describedby={error ? "approval-action-error" : undefined}
              />
            </div>

            {error && (
              <div id="approval-action-error" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive" role="alert">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{translateStoredError(error)}</span>
              </div>
            )}

            <DialogFooter className="border-t border-border/40 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={processMutation.isPending}
                className="h-9 rounded-lg"
              >
                {translateI18n("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={processMutation.isPending || projectModelUnavailable || (requiresPic && (picsLoading || picsError || !picId))}
                variant={action === "REJECT" ? "destructive" : "default"}
                className={action === "APPROVE" ? "h-9 rounded-lg bg-emerald-500 font-semibold text-black hover:bg-emerald-600" : "h-9 rounded-lg"}
              >
                {translateI18n(processMutation.isPending ? "approvalDialog.processing" : requiresPic ? "approvalDialog.confirmAndAssign" : action === "APPROVE" ? "approvalDialog.confirmApprove" : "approvalDialog.confirmReject")}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1 rounded-xl border border-border/40 bg-muted/15 p-3 text-xs">
              <p>{translateI18n("copy.statusLabel")} <strong className="text-foreground">{translateI18n(item.status === "APPROVED" ? "approvalStatus.APPROVED" : item.status === "REJECTED" ? "approvalStatus.REJECTED" : "approvalStatus.PENDING")}</strong></p>
              <p>{translateI18n("copy.reviewedBy")} <strong className="text-foreground">{item.reviewer?.full_name || item.reviewer?.fullName || "-"}</strong></p>
              {item.reviewNote && <p>{translateI18n("copy.reviewNoteLabel")} <strong className="text-foreground">&quot;{item.reviewNote}&quot;</strong></p>}
            </div>
            <DialogFooter className="border-t border-border/40 pt-4">
              <Button type="button" variant="outline" className="h-9 rounded-lg" onClick={() => onOpenChange(false)}>
                {translateI18n("common.close")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString(getIntlLocale(), { dateStyle: "medium" });
}

function DeadlineBox({
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
    <div className="space-y-0.5 rounded-xl border border-border/40 bg-card/70 p-3 text-[11px]">
      <p className="font-semibold text-foreground">{title}</p>
      <p>{translateI18n("approvalDialog.startDate", { date: formatDate(deadline?.start_date) })}</p>
      <p>{translateI18n("approvalDialog.duration", { count: deadline?.duration_working_days || "-" })}</p>
      <p>{translateI18n("approvalDialog.dueDate", { date: formatDate(deadline?.due_date) })}</p>
      {deadline?.change_reason && <p className="text-muted-foreground italic">{translateI18n("approvalDialog.reason", { reason: deadline.change_reason })}</p>}
    </div>
  );
}
