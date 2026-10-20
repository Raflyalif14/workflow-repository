"use client";

import { translate as translateI18n, translateRole } from "@/i18n";
import { Check, Send, X, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getDraftPlanProgressStatuses, resolveNextAction } from "@/lib/workflow-ux-helpers";
import { Project, ProjectMilestonePhase4, ProjectPlanApproval } from "@/types/project";
import { formatDateTime } from "@/lib/project-detail-format";

export function NextActionCard({
  nextAction,
  onAction,
  isSubmittingPlan,
  isResuming,
}: {
  nextAction: ReturnType<typeof resolveNextAction>;
  onAction: () => void;
  isSubmittingPlan: boolean;
  isResuming: boolean;
}) {
  const isDirectAction = ["SUBMIT_PLAN", "RESUBMIT_PLAN", "RESUME_PROJECT"].includes(nextAction.actionType || "");
  const usesActionLabel = isDirectAction || ["SETUP_TIMELINE", "CONTINUE_PHASE"].includes(nextAction.actionType || "");
  const isPending =
    (nextAction.actionType === "SUBMIT_PLAN" || nextAction.actionType === "RESUBMIT_PLAN")
      ? isSubmittingPlan
      : nextAction.actionType === "RESUME_PROJECT" && isResuming;
  const actionLabel = usesActionLabel ? nextAction.actionLabel || translateI18n("projectDetail.openTask") : translateI18n("projectDetail.openTask");
  const pendingLabel =
    nextAction.actionType === "RESUBMIT_PLAN"
      ? translateI18n("projectDetail.resubmitting")
      : nextAction.actionType === "RESUME_PROJECT"
      ? translateI18n("projectDetail.resuming")
      : translateI18n("projectDetail.submitting");

  return (
    <section aria-labelledby="next-step-title" className="border-b border-border/60 pb-5">
      <div className="flex min-w-0 flex-col items-start gap-3">
        <div className="min-w-0 space-y-1">
          <p className={`flex items-center gap-2 text-sm font-medium ${nextAction.canPerformAction ? "text-primary" : "text-muted-foreground"}`}>
            {nextAction.isWaiting && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/70" aria-hidden="true" />}
            {nextAction.isWaiting && nextAction.waitingForRole
              ? translateI18n("projectDetail.waitingOn", { role: translateRole(nextAction.waitingForRole) })
              : nextAction.canPerformAction
              ? translateI18n("projectDetail.yourNextTask")
              : translateI18n("projectDetail.projectStatus")}
          </p>
          <h2 id="next-step-title" className="text-lg font-semibold text-foreground">{nextAction.title}</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{nextAction.description}</p>
        </div>

        {nextAction.canPerformAction && nextAction.actionType !== "NONE" && (
          <Button
            size="sm"
            onClick={onAction}
            disabled={isPending}
            aria-label={usesActionLabel ? actionLabel : translateI18n("projectDetail.openTaskNamed", { name: nextAction.title })}
            className="h-10 w-full gap-2 shadow-none sm:w-auto"
          >
            {["SUBMIT_PLAN", "RESUBMIT_PLAN"].includes(nextAction.actionType || "") && <Send className="h-4 w-4 shrink-0" aria-hidden="true" />}
            {isPending ? pendingLabel : actionLabel}
          </Button>
        )}
      </div>
    </section>
  );
}

export function DraftProgressionTracker({
  planApproval,
  milestones,
  workflowModel,
  workflowVersion,
}: {
  planApproval?: ProjectPlanApproval | null;
  milestones: ProjectMilestonePhase4[];
  workflowModel?: string | null;
  workflowVersion?: number | null;
}) {
  const statuses = getDraftPlanProgressStatuses(milestones, planApproval, workflowModel, workflowVersion);

  const steps = [
    { number: 1, label: translateI18n("projectDetail.timelineSetup"), status: statuses[0] },
    {
      number: 2,
      label: translateI18n("projectDetail.planSubmittedStep"),
      status: statuses[1],
    },
    {
      number: 3,
      label: translateI18n("projectDetail.headReviewStep"),
      status: statuses[2],
    },
    { number: 4, label: translateI18n("projectDetail.projectActiveStep"), status: statuses[3] },
  ];

  return (
    <section aria-labelledby="plan-progress-title" className="border-b border-border/60 pb-4">
      <p id="plan-progress-title" className="mb-3 text-sm font-medium text-foreground">{translateI18n("copy.planProgress")}</p>
      <ol className="grid grid-cols-1 gap-y-3 sm:grid-cols-4 sm:gap-x-4">
        {steps.map((step, index) => {
          const stateLabel =
            step.status === "COMPLETED"
              ? translateI18n("projectStatus.COMPLETED")
              : step.status === "CURRENT"
              ? translateI18n("milestoneStatus.IN_PROGRESS")
              : step.status === "REJECTED"
              ? translateI18n("milestoneStatus.REVISION_REQUIRED")
              : translateI18n("projectDetail.waiting");

          return (
            <li key={step.number} className={`flex min-w-0 items-start gap-2.5 ${index > 0 ? "sm:border-l sm:border-border/60 sm:pl-4" : ""}`}>
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  step.status === "COMPLETED"
                    ? "bg-emerald-400"
                    : step.status === "CURRENT"
                    ? "bg-primary"
                    : step.status === "REJECTED"
                    ? "bg-destructive"
                    : "bg-muted-foreground/50"
                }`}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{step.label}</p>
                <p className={step.status === "CURRENT" ? "text-xs font-medium text-primary" : "text-xs text-muted-foreground"}>{stateLabel}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function ProjectPlanCard({
  project,
  approval,
  canSubmit,
  canReview,
  onSubmit,
  isSubmitting,
  reviewWorkspace = false,
  onReviewDecision,
}: {
  project: Project;
  approval: ProjectPlanApproval | null | undefined;
  canSubmit: boolean;
  canReview: boolean;
  onSubmit: () => void;
  isSubmitting: boolean;
  reviewWorkspace?: boolean;
  onReviewDecision: (decision: "APPROVE" | "REJECT") => void;
}) {
  return (
    <>
      <Card className={reviewWorkspace ? "border-border/60 bg-card shadow-none hover:border-border/60" : approval?.status === "REJECTED" ? "border-destructive/40 bg-destructive/5 shadow-none hover:border-destructive/40" : ""}>
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold tracking-tight">
              {translateI18n(reviewWorkspace ? "projectDetail.reviewDecision" : "projectDetail.planSignOff")}
            </CardTitle>
            <CardDescription className="text-xs">
              {reviewWorkspace
                ? translateI18n("projectDetail.reviewDecisionHelp")
                : translateI18n("projectDetail.planSignOffHelp")}
            </CardDescription>
          </div>
          {approval ? <PlanApprovalBadge status={approval.status} /> : <Badge variant="outline" className="self-start sm:self-auto">{translateI18n("copy.notSubmitted")}</Badge>}
        </CardHeader>
        <CardContent className="space-y-3">
          {approval ? (
            <div className="space-y-2 border-y border-border/50 py-3 text-xs">
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <span>{translateI18n("copy.submittedByLabel")} <strong className="text-foreground">{approval.requested_by?.full_name || "-"}</strong></span>
                <span>•</span>
                <span>{translateI18n("copy.submittedAt")} <strong className="text-foreground">{formatDateTime(approval.submitted_at)}</strong></span>
              </div>
              {approval.request_note && (
                <div className="rounded-lg border border-border/40 bg-muted/20 p-2.5 text-xs">
                  <p className="font-semibold text-foreground">{translateI18n("projectDetail.submissionNote")}</p>
                  <p className="text-muted-foreground">{approval.request_note}</p>
                </div>
              )}
              {approval.status === "REJECTED" && approval.review_note && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <XCircle className="h-4 w-4" />
                    <span>{translateI18n("copy.headRejectReason")}</span>
                  </p>
                  <p className="leading-relaxed pl-5 font-medium">{approval.review_note}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {translateI18n("projectDetail.planTimelineHelp")}
            </p>
          )}

          <div className="flex shrink-0 flex-wrap gap-2 border-t border-border/40 pt-3">
            {canSubmit && (
              <Button size="sm" className="gap-1.5 shadow-none" onClick={onSubmit} disabled={isSubmitting}>
                <Send className="h-3.5 w-3.5" />
                <span>{translateI18n(isSubmitting ? "projectDetail.submitting" : approval?.status === "REJECTED" ? "nextAction.resubmitPlan" : "nextAction.submitPlanAction")}</span>
              </Button>
            )}
            {canReview && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/30 text-destructive hover:bg-destructive/10 gap-1.5"
                  onClick={() => onReviewDecision("REJECT")}
                >
                  <X className="h-3.5 w-3.5" />
                  <span>{translateI18n("copy.rejectPlan")}</span>
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 shadow-none"
                  onClick={() => onReviewDecision("APPROVE")}
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>{translateI18n("copy.approveActivate")}</span>
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>


    </>
  );
}

function PlanApprovalBadge({ status }: { status: string }) {
  if (status === "APPROVED") return <Badge variant="success">{translateI18n("milestoneStatus.APPROVED")}</Badge>;
  if (status === "REJECTED") return <Badge variant="destructive">{translateI18n("approvalStatus.REJECTED")}</Badge>;
  return <Badge variant="warning">{translateI18n("copy.pendingReview")}</Badge>;
}
