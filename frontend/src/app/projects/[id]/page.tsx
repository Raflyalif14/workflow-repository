"use client";
import Link from "next/link";
import { ProjectMeetings } from "@/components/projects/project-meetings";
import { compareMilestoneSchedule, getScheduledWorkStage } from '@/lib/milestone-order';
import { projectDisplayStatus } from '@/lib/project-display-status';
import { useOutcomeEvidence } from '@/hooks/use-outcome-evidence';
import { OutcomeEvidenceField } from '@/components/projects/outcome-evidence-field';

import { formatContractAmountInput, parseContractAmount } from "@/lib/contract-amount";
import { ProjectDocumentSharing } from "@/components/projects/project-document-sharing";
import { ProjectReportExport } from "@/components/projects/project-report-export";
import { BusinessConfirmation } from "@/components/projects/business-confirmation";
import { focusOutputReviewLink } from "@/lib/approval-queue";
import { ApiError } from "@/lib/api-client";
import { EstimatedProjectValue } from "@/components/projects/estimated-project-value";
import { activePhaseMilestones, isPraTenderDecisionPending, isProjectClosedAtPraTender } from "@/lib/phase-review";
import { ProjectPhasesPanel } from "@/components/projects/project-phases-panel";
import { useLanguage } from "@/components/i18n/language-provider";
import { translate as translateI18n, translateOutputName, translateStoredError, translateStoredMessage } from "@/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, Clock3, PauseCircle, Trophy, XCircle } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { AssignmentHistoryCard } from "@/components/projects/assignment-history-card";
import { PicAssignmentCard } from "@/components/projects/pic-assignment-card";
import { PostponeProjectDialog } from "@/components/projects/postpone-project-dialog";
import { ProjectDeletionDangerZone } from "@/components/projects/project-deletion-danger-zone";
import { ProjectTimelineEditor } from "@/components/projects/project-timeline-editor";
import { OutputDocumentsSection } from "@/components/projects/output-documents-section";
import { OutputScopeSection } from "@/components/projects/output-scope-section";
import { useOutputDocuments } from "@/hooks/use-output-documents";
import {
  initialExpandedMilestoneIds,
  milestoneIdFromHash,
  reconcileExpandedMilestoneIds,
} from "@/lib/milestone-presentation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isMilestoneCompleted } from "@/lib/milestone-ui-state";
import {
  formatProjectStatusLabel,
  resolveNextAction,
  resolveNextActionTargetId,
} from "@/lib/workflow-ux-helpers";
import { formatMilestoneDate } from "@/lib/dates";
import {
  useProject,
  useProjectMilestones,
  useProjectPlanApproval,
  useResumeProject,
  useReviewProjectPlan,
  useSetProjectOutcome,
  useSubmitProjectPlan,
} from "@/hooks/use-projects";
import { calculateProjectMilestoneProgress } from "@/lib/project-milestone-progress";
import { ProjectDocumentsSection } from "@/components/projects/project-documents-section";
import { MilestoneApprovalState, useMilestoneApprovalStates, useStartMilestone } from "@/hooks/use-milestone-workflow";
import { ActivityTimeline } from "@/components/projects/project-activity-timeline";
import { ProjectIntakeSection } from "@/components/projects/project-intake-section";
import { NextActionCard, DraftProgressionTracker, ProjectPlanCard } from "@/components/projects/project-plan-summary";
import { MilestoneRow } from "@/components/projects/project-milestone-row";
import { PlanReviewDialog } from "@/components/projects/project-plan-review-dialog";
import { StatusBadge } from "@/components/projects/project-status-badge";
import { formatIdr, formatDateTime } from "@/lib/project-detail-format";
import { ProjectResultCard } from "@/components/projects/project-result-card";
import { triggerWonConfetti } from "@/lib/confetti";

export default function ProjectDetailPage() {
  useLanguage();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { data: project, isLoading: projectLoading, isError, refetch: refetchProject } = useProject(id, { includeActivity: false });
  const { data: milestoneData, isLoading: milestonesLoading, isError: milestonesError, refetch: refetchMilestones } = useProjectMilestones(id);
  const allMilestones = useMemo(() => milestoneData ?? [], [milestoneData]);
  const milestones = useMemo(() => [...activePhaseMilestones(project, allMilestones)].sort(compareMilestoneSchedule), [allMilestones, project]);
  const outputReadiness = useOutputDocuments(id);
  const progress = !milestonesError && milestoneData ? calculateProjectMilestoneProgress(milestones) : null;
  const { data: planApproval } = useProjectPlanApproval(id);
  const approvalQueries = useMilestoneApprovalStates(milestones, Boolean(milestones.length));
  const [businessConfirmation, setBusinessConfirmation] = useState<"PLAN" | "RESUME" | null>(null);
  const outcomeSaving = useRef(false);
  const [outcomeConfirming, setOutcomeConfirming] = useState(false);
  const submitProjectPlan = useSubmitProjectPlan(id);
  const reviewProjectPlan = useReviewProjectPlan(id);
  const [planReviewTarget, setPlanReviewTarget] = useState<{ decision: "APPROVE" | "REJECT"; projectName: string; phaseName: string; approvalId?: string } | null>(null);
  const resumeProject = useResumeProject();
  const setProjectOutcome = useSetProjectOutcome(id);
  const startNextMilestone = useStartMilestone(id);

  const [postponeOpen, setPostponeOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [outcomeDecision, setOutcomeDecision] = useState<"WON" | "LOST" | null>(null);
  const evidence = useOutcomeEvidence(project?.id || '');
  const [finalContractValue, setFinalContractValue] = useState("");
  const [lossReason, setLossReason] = useState("");
  const [expandedMilestones, setExpandedMilestones] = useState<Set<string>>(() => new Set());
  const initializedExpansionProject = useRef<string | null>(null);
  const manuallyToggledMilestones = useRef<Set<string>>(new Set());
  const projectId = project?.id;
  // Hash navigation depends on membership, not background status updates.
  const allMilestoneIds = JSON.stringify(allMilestones.map((milestone) => milestone.id));

  useEffect(() => {
    if (!projectId || milestonesLoading) return;
    if (initializedExpansionProject.current !== projectId) {
      initializedExpansionProject.current = projectId;
      manuallyToggledMilestones.current.clear();
      setExpandedMilestones(initialExpandedMilestoneIds(milestones, outputReadiness.data?.documents, user?.role));
    } else {
      setExpandedMilestones((current) => {
        const next = reconcileExpandedMilestoneIds(current, milestones, outputReadiness.data?.documents,
          user?.role, manuallyToggledMilestones.current);
        return next.size === current.size ? current : next;
      });
    }
  }, [projectId, milestonesLoading, milestones, outputReadiness.data, user?.role]);

  useEffect(() => {
    if (!projectId || milestonesLoading || typeof window === "undefined") return;
    const validMilestoneIds: string[] = JSON.parse(allMilestoneIds);
    const openLinkedMilestone = () => {
      const milestoneId = milestoneIdFromHash(window.location.hash, validMilestoneIds);
      if (!milestoneId) return;
      setExpandedMilestones((current) => new Set(current).add(milestoneId));
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        focusOutputReviewLink(window.location.hash, milestoneId, document);
      }));
    };
    openLinkedMilestone();
    window.addEventListener("hashchange", openLinkedMilestone);
    return () => window.removeEventListener("hashchange", openLinkedMilestone);
  }, [projectId, milestonesLoading, allMilestoneIds]);

  const approvalByMilestone = useMemo(() => {
    const states = new Map<string, MilestoneApprovalState>();
    milestones.forEach((milestone, index) => {
      states.set(milestone.id, {
        deadlineApproval: approvalQueries[index]?.data ?? null,
      });
    });
    return states;
  }, [approvalQueries, milestones]);

  if (projectLoading) {
    return (
      <div className="container py-16 space-y-6">
        <div className="h-8 w-32 bg-muted/40 rounded animate-pulse" />
        <div className="h-28 rounded-xl bg-muted/30 animate-pulse" />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="h-24 rounded-xl bg-muted/30 animate-pulse" />
          <div className="h-24 rounded-xl bg-muted/30 animate-pulse" />
          <div className="h-24 rounded-xl bg-muted/30 animate-pulse" />
        </div>
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="container py-16 text-center space-y-3">
        <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
        <h2 className="text-lg font-bold text-foreground">{translateI18n("copy.projectNotFound")}</h2>
        <p className="text-xs text-muted-foreground">{translateI18n("copy.projectNoAccess")}</p>
        <Link href="/projects" prefetch={true}>
          <Button variant="outline" size="sm">
            {translateI18n("copy.backToProject")}
          </Button>
        </Link>
      </div>
    );
  }

  const isSalesOwner = user?.role === "SALES" && project.sales_id === user.id;
  const isHeadSa = user?.role === "HEAD_SA";
  const isDraft = project.status === "DRAFT";
  const isActive = project.status === "ACTIVE";
  const isPostponed = project.status === "POSTPONED" || project.is_postponed;
  const isCompleted = ["COMPLETED", "WAITING_RESULT", "WON", "LOST"].includes(project.status);
  const isWaitingResult = project.status === "WAITING_RESULT";
  const unfinishedMilestones = milestones.filter((milestone) => !isMilestoneCompleted(milestone));
  const unapprovedOutputCount = outputReadiness.data?.unapprovedCount ?? 0;
  const canSeeOutputNames = isHeadSa || ((user?.role === "SA" || user?.role === "HEAD_SA") && project.pic?.id === user?.id);
  const pendingOutputNames = canSeeOutputNames
    ? outputReadiness.data?.documents.filter((item) => (item.isRequired || item.isSelected) && item.status !== "APPROVED").map((item) => translateOutputName(item.key, item.name)) || []
    : [];
  const isHeadSaPlanReviewWorkspace =
    isHeadSa && isDraft && planApproval?.status === "PENDING";

  const currentStageMilestone = getScheduledWorkStage(milestones);
  const tenderResultStage = isSalesOwner ? milestones.find((milestone) =>
    milestone.workflow_stage?.stage_key === 'TENDER_PROCESS' && milestone.workflow_stage.default_role === 'SALES'
    && !milestones.some((other) => other.step_order > milestone.step_order)) : undefined;
  const visibleWorkStages = milestones.filter((milestone) => milestone.id !== tenderResultStage?.id);
  const assignPicIsCurrent = milestones.some(
    (m) => m.status === "IN_PROGRESS" && m.name.trim().toLowerCase() === "assign pic"
  );
  const nextAction = resolveNextAction(project, milestones, planApproval, {
    id: user?.id,
    role: user?.role,
    fullName: user?.fullName,
  }, {
    outputDocuments: outputReadiness.data?.documents,
  });
  const showPlanCardSubmit =
    isSalesOwner &&
    planApproval?.status !== "PENDING" &&
    !["SETUP_TIMELINE", "SUBMIT_PLAN", "RESUBMIT_PLAN"].includes(nextAction.actionType || "");
  const isHeadSaWaitingForSalesPlan =
    isHeadSa &&
    isDraft &&
    !planApproval &&
    nextAction.isWaiting &&
    nextAction.waitingForRole === "SALES";
  const projectPicNotice =
    !project.pic && (isActive || isCompleted)
      ? isActive && assignPicIsCurrent
        ? { message: translateI18n("projectDetail.assignLead"), tone: "neutral" as const }
        : { message: translateI18n("projectDetail.leadMissing"), tone: "warning" as const }
      : undefined;
  const shouldShowProjectPic = Boolean(project.pic) || isActive || isCompleted;

  const submitPlan = async () => {
    setError("");
    setMessage("");
    try {
      await submitProjectPlan.mutateAsync();
      setMessage("projectDetail.planSubmitted");
    } catch (submitError) {
      setError("projectDetail.planSubmitFailed");
      throw submitError;
    }
  };

  const resume = async () => {
    setError("");
    setMessage("");
    try {
      await resumeProject.mutateAsync(project.id);
      setMessage("projectDetail.resumed");
    } catch (resumeError) {
      setError("projectDetail.resumeFailed");
      throw resumeError;
    }
  };

  const parsedFinalContractValue = parseContractAmount(finalContractValue);
  const resetOutcome = () => {
    setOutcomeDecision(null);
    setOutcomeConfirming(false);
    setFinalContractValue("");
    setLossReason("");
    setError("");
    evidence.reset();
  };
  const closeOutcome = async () => {
    if (outcomeSaving.current || setProjectOutcome.isPending || evidence.isUploading) return;
    try {
      if (await evidence.discard()) resetOutcome();
    } catch {
      setError('workflowUpdate.evidenceDiscardFailed');
    }
  };

  const recordOutcome = async () => {
    if (!outcomeDecision || outcomeSaving.current || error === "businessAudit.stale") return;
    setError("");
    setMessage("");
    if (outcomeDecision === "WON" && parsedFinalContractValue === null) {
      setError("projectDetail.finalValueInvalid");
      return;
    }
    if (outcomeDecision === "LOST" && !lossReason.trim()) {
      setError("projectDetail.lossReasonRequired");
      return;
    }
    if (!evidence.files.length) { setError('workflowUpdate.evidenceRequired'); return; }
    if (!outcomeConfirming) { setOutcomeConfirming(true); return; }
    outcomeSaving.current = true;
    try {
      const evidenceIds = await evidence.prepare();
      await setProjectOutcome.mutateAsync({
        evidenceDocumentIds: evidenceIds,
        outcome: outcomeDecision,
        finalContractValue: outcomeDecision === "WON" ? parsedFinalContractValue ?? undefined : undefined,
        lossReason: outcomeDecision === "LOST" ? lossReason : undefined,
      });
      if (outcomeDecision === "WON") {
        triggerWonConfetti();
      }
      setMessage(outcomeDecision === "WON" ? "projectDetail.resultWon" : "projectDetail.resultLost");
      resetOutcome();
    } catch (outcomeError: any) {
      const errKey = outcomeError instanceof Error ? outcomeError.message : "";
      setError(
        errKey === "workflowUpdate.evidenceRequired"
          ? errKey
          : outcomeError instanceof ApiError && outcomeError.status === 409
          ? "businessAudit.stale"
          : "projectDetail.resultFailed"
      );
    } finally { outcomeSaving.current = false; }
  };

  const handleNextAction = () => {
    switch (nextAction.actionType) {
      case "START_MILESTONE":
        if (nextAction.canPerformAction && nextAction.targetMilestoneId && !startNextMilestone.isPending) {
          startNextMilestone.mutate(nextAction.targetMilestoneId);
        }
        return;
      case "SUBMIT_PLAN":
      case "RESUBMIT_PLAN":
        submitProjectPlan.prepare?.(); setBusinessConfirmation("PLAN");
        return;
      case "RESUME_PROJECT":
        resumeProject.prepare?.(project.id); setBusinessConfirmation("RESUME");
        return;
      default: {
        const targetId = resolveNextActionTargetId(nextAction);
        if (!targetId || typeof document === "undefined") return;

        const targetMilestoneId = milestoneIdFromHash(`#${targetId}`, milestones.map((milestone) => milestone.id));
        if (targetMilestoneId) setExpandedMilestones((current) => new Set(current).add(targetMilestoneId));
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
          const target = document.getElementById(targetId);
          const history = target?.closest("details");
          if (history) history.open = true;
          target?.scrollIntoView({ behavior: "smooth", block: "start" });
          target?.focus({ preventScroll: true });
        }));
      }
    }
  };

  const openPlanReview = (decision: 'APPROVE' | 'REJECT') => setPlanReviewTarget({ decision,
    projectName: project.name, phaseName: project.active_scenario?.name || project.scenario?.name || '', approvalId: planApproval?.id });
  const savePlanReview = async (note?: string, picId?: string, expectedApprovalId?: string, expectedPicRevision?: string, requestId?: string) => {
    if (!planReviewTarget) return;
    await reviewProjectPlan.mutateAsync({ decision: planReviewTarget.decision, note, picId, expectedApprovalId, expectedPicRevision, requestId });
    setPlanReviewTarget(null);
  };
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-6 sm:px-6 xl:px-8 xl:py-8">
      {/* Back Button */}
      <Link href="/projects" prefetch={true} className="inline-block">
        <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1.5 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          <span>{translateI18n("copy.backToProject")}</span>
        </Button>
      </Link>

      {/* Header */}
      <header className="flex flex-col gap-4 pb-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-4xl space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <StatusBadge status={project.status} label={projectDisplayStatus(project)} />
          </div>
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{project.name}</h1>
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
            {translateI18n("projectDetail.customer")} <strong className="text-foreground">{project.customer}</strong> · {translateI18n("projectDetail.scenario")}{" "}
            <strong className="text-foreground">{project.active_scenario?.name || project.scenario?.name || translateI18n("ui.noScenario")}</strong>
          </p>
          <p className="text-sm text-muted-foreground">
            {translateI18n("ui.salesOwner")} <strong className="text-foreground">{project.sales?.full_name || project.sales?.fullName || translateI18n("ui.noOwner")}</strong>
          </p>
          <EstimatedProjectValue project={project} role={user?.role} userId={user?.id} />
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <ProjectReportExport key={id} projectId={id} />
          {isActive && isSalesOwner && (
            <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-lg" onClick={() => setPostponeOpen(true)}>
              <PauseCircle className="h-4 w-4 text-warning" />
              <span>{translateI18n("projectDetail.postpone")}</span>
            </Button>
          )}
        </div>
      </header>

      <ProjectPhasesPanel project={project} role={user?.role} userId={user?.id} />
      <ProjectDocumentSharing project={project} />

      {/* Global Alerts */}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{translateStoredError(error)}</span>
        </div>
      )}
      {message && (
        <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{translateStoredMessage(message)}</span>
        </div>
      )}

      {/* ─── Project Result Hero Card (WON / LOST) ─── */}
      <ProjectResultCard project={project} />

      {/* ─── Next Action Card ─── */}
      {(!tenderResultStage || nextAction.targetMilestoneId !== tenderResultStage.id) && !isPraTenderDecisionPending(project) && !isProjectClosedAtPraTender(project) && <NextActionCard
        nextAction={nextAction}
        onAction={handleNextAction}
        isSubmittingPlan={submitProjectPlan.isPending}
        isResuming={resumeProject.isPending}
        isStartingMilestone={startNextMilestone.isPending}
        startError={nextAction.actionType === 'START_MILESTONE' && startNextMilestone.isError ? translateI18n('workflowUpdate.startFailed') : undefined}
      />}

      {tenderResultStage && <MilestoneRow
        key={tenderResultStage.id}
        project={project}
        milestone={tenderResultStage}
        isFinalMilestone
        isCurrentStage
        hasNextCreatedMilestone={false}
        finalPrerequisitesComplete={visibleWorkStages.every((milestone) => ['COMPLETED', 'APPROVED'].includes(milestone.status))}
        expanded={false}
        onToggle={() => {}}
        resultOnly
      />}

      <ProjectMeetings key={project.id} project={project} />

      {(isActive || isPostponed) && !isPraTenderDecisionPending(project) && (
        <section aria-label={translateI18n("copy.pendingItems")} className="page-surface p-4 text-sm sm:p-5">
          <h2 className="font-semibold text-foreground">{translateI18n("copy.pendingItems")}</h2>
          {milestonesLoading || outputReadiness.isLoading ? (
            <p className="mt-2 text-muted-foreground">{translateI18n("copy.checkingProgress")}</p>
          ) : outputReadiness.isError ? (
            <p className="mt-2 text-muted-foreground">{translateI18n("copy.outputStatusError")}</p>
          ) : (
            <div className="mt-2 space-y-1 text-muted-foreground">
              {unfinishedMilestones.length > 0 && <p>{translateI18n(unfinishedMilestones.length === 1 ? "projectDetail.milestoneRemainingOne" : "projectDetail.milestonesRemaining", { count: unfinishedMilestones.length })}</p>}
              {unapprovedOutputCount > 0 && <p>{translateI18n(unapprovedOutputCount === 1 ? "projectDetail.outputRemainingOne" : "projectDetail.outputsRemaining", { count: unapprovedOutputCount })} {translateI18n(canSeeOutputNames ? "projectDetail.outputNextAction" : "projectDetail.outputWait")}</p>}
              {pendingOutputNames.length > 0 && <p className="break-words">{translateI18n("projectDetail.outputsNeedingAction", { names: pendingOutputNames.join(", ") })}</p>}
              {unfinishedMilestones.length === 0 && unapprovedOutputCount === 0 && <p>{translateI18n("copy.allComplete")}</p>}
              {isPostponed && <p>{translateI18n("copy.pausedBanner")}</p>}
            </div>
          )}
        </section>
      )}

      {/* ─── Postponed Banner ─── */}
      {isPostponed && (
        <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-warning">
            <PauseCircle className="h-5 w-5 shrink-0" />
            <span>{translateI18n("copy.projectPaused")}</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {project.postpone_reason
              ? translateI18n("ui.reasonValue", { reason: project.postpone_reason })
              : translateI18n("ui.postponedByOwner")}
            {" "}{translateI18n("projectDetail.pausedActions")}
          </p>
          {project.postponed_at && (
            <p className="text-[11px] font-mono text-muted-foreground">
              {translateI18n("projectDetail.postponedAt", { date: formatDateTime(project.postponed_at) })}
            </p>
          )}
        </div>
      )}

      {/* Delivery result */}
      {isWaitingResult && (
        <div className="flex flex-col gap-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-warning">
              <Clock3 className="h-5 w-5 shrink-0" />
              <span>{translateI18n("copy.waitingTender")}</span>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {translateI18n("projectDetail.waitingResult")}
            </p>
          </div>
          {isSalesOwner && (
            <div className="flex w-full gap-2 sm:w-auto">
              <Button
                type="button"
                size="sm"
                className="flex-1 sm:flex-none gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                disabled={setProjectOutcome.isPending || evidence.isUploading}
                onClick={() => {
                  setError("");
                  setOutcomeDecision("WON");
                  setOutcomeConfirming(false);
                  if (!finalContractValue && project.estimated_revenue) {
                    setFinalContractValue(formatContractAmountInput(String(project.estimated_revenue), "", "insertText"));
                  }
                }}
              >
                <Trophy className="h-4 w-4" />
                {translateI18n("projectDetail.recordWon")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-1 sm:flex-none gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 font-semibold"
                disabled={setProjectOutcome.isPending || evidence.isUploading}
                onClick={() => {
                  setError("");
                  setOutcomeDecision("LOST");
                  setOutcomeConfirming(false);
                }}
              >
                <XCircle className="h-4 w-4" />
                {translateI18n("projectDetail.recordLost")}
              </Button>
            </div>
          )}
        </div>
      )}

      <BusinessConfirmation open={businessConfirmation !== null} onOpenChange={open => !open && setBusinessConfirmation(null)}
        title={project.name} changes={[project.active_scenario?.name || project.scenario?.name || "", translateI18n(businessConfirmation === "PLAN" ? "businessAudit.plan" : "businessAudit.resume")]}
        action={translateI18n(businessConfirmation === "PLAN" ? "businessAudit.submit" : "businessAudit.save")}
        onConfirm={businessConfirmation === "PLAN" ? submitPlan : resume} />
      <Dialog
        open={Boolean(outcomeDecision)}
        onOpenChange={(open) => {
          if (!open) closeOutcome();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {outcomeDecision === "WON" ? (
              <>
                <Trophy className="h-5 w-5 text-emerald-600" />
                <span>{translateI18n("projectDetail.recordWon")}</span>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-destructive" />
                <span>{translateI18n("projectDetail.recordLost")}</span>
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {outcomeDecision === "WON"
              ? translateI18n("projectDetail.wonValueRequired")
              : translateI18n("projectDetail.lossReasonRequired")}
          </DialogDescription>
        </DialogHeader>

        {/* WON vs LOST Toggle Switch */}
        <div className="grid grid-cols-2 gap-2 pt-1 pb-1">
          <button
            type="button"
            onClick={() => {
              setError("");
              setOutcomeDecision("WON");
              setOutcomeConfirming(false);
              if (!finalContractValue && project.estimated_revenue) {
                setFinalContractValue(formatContractAmountInput(String(project.estimated_revenue), "", "insertText"));
              }
            }}
            disabled={setProjectOutcome.isPending || evidence.isUploading}
            className={`flex items-center justify-center gap-2 rounded-xl border-2 p-2.5 text-xs font-semibold transition-all ${
              outcomeDecision === "WON"
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 shadow-sm"
                : "border-border/60 bg-card hover:bg-muted text-muted-foreground"
            }`}
          >
            <Trophy className="h-4 w-4" />
            <span>{translateI18n("projectStatus.WON")}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setError("");
              setOutcomeDecision("LOST");
              setOutcomeConfirming(false);
            }}
            disabled={setProjectOutcome.isPending || evidence.isUploading}
            className={`flex items-center justify-center gap-2 rounded-xl border-2 p-2.5 text-xs font-semibold transition-all ${
              outcomeDecision === "LOST"
                ? "border-destructive bg-destructive/10 text-destructive shadow-sm"
                : "border-border/60 bg-card hover:bg-muted text-muted-foreground"
            }`}
          >
            <XCircle className="h-4 w-4" />
            <span>{translateI18n("projectStatus.LOST")}</span>
          </button>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void recordOutcome();
          }}
        >
          {outcomeDecision === "WON" ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="final-contract-value" className="block text-xs font-semibold text-muted-foreground">
                  {translateI18n("projectDetail.finalContractValue")}
                </label>
                {project.estimated_revenue && (
                  <button
                    type="button"
                    onClick={() => {
                      setProjectOutcome.prepare?.();
                      setFinalContractValue(formatContractAmountInput(String(project.estimated_revenue), "", "insertText"));
                      setOutcomeConfirming(false);
                    }}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    {translateI18n("copy.useEstimated")}
                  </button>
                )}
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm font-semibold text-muted-foreground select-none">
                  Rp
                </span>
                <Input
                  id="final-contract-value"
                  type="text"
                  inputMode="decimal"
                  className="pl-10 font-semibold text-base"
                  placeholder="100.000.000"
                  value={finalContractValue}
                  onChange={(event) => {
                    setProjectOutcome.prepare?.();
                    setFinalContractValue(formatContractAmountInput(event.target.value, finalContractValue, (event.nativeEvent as InputEvent).inputType));
                    setOutcomeConfirming(false);
                  }}
                  disabled={setProjectOutcome.isPending || evidence.isUploading}
                  required
                />
              </div>
              {project.estimated_revenue && (
                <p className="text-[11px] text-muted-foreground">
                  💡 {translateI18n("copy.autoFilledFromEstimate")}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <label htmlFor="loss-reason" className="block text-xs font-semibold text-muted-foreground">
                {translateI18n("copy.lossReason")}
              </label>
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">{translateI18n("copy.lossReasonSuggestions")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {(["copy.lossReasonPrice", "copy.lossReasonSpec", "copy.lossReasonCancelled", "copy.lossReasonCompetitor", "copy.lossReasonSchedule"] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setProjectOutcome.prepare?.();
                        setLossReason(translateI18n(key));
                        setOutcomeConfirming(false);
                      }}
                      className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      disabled={setProjectOutcome.isPending || evidence.isUploading}
                    >
                      {translateI18n(key)}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                id="loss-reason"
                value={lossReason}
                onChange={(event) => { setProjectOutcome.prepare?.(); setLossReason(event.target.value); setOutcomeConfirming(false); }}
                className="min-h-20 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder={translateI18n("copy.lossReasonPlaceholder")}
                disabled={setProjectOutcome.isPending || evidence.isUploading}
                maxLength={2000}
                required
              />
            </div>
          )}
          <OutcomeEvidenceField files={evidence.files} onChange={files => { evidence.setFiles(files); setOutcomeConfirming(false); }} disabled={setProjectOutcome.isPending || evidence.isUploading} />
          {outcomeConfirming && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-1.5 text-xs">
              <p className="font-semibold text-primary">{translateI18n("copy.confirmOutcomeTitle")}</p>
              <p className="text-foreground">
                <span className="text-muted-foreground">{translateI18n("copy.projectColon")}</span> <strong>{project.name}</strong>
              </p>
              <p className="text-foreground">
                <span className="text-muted-foreground">{translateI18n("copy.statusLabel")}</span> {formatProjectStatusLabel(project.status)} {" → "} <strong>{formatProjectStatusLabel(outcomeDecision || "")}</strong>
              </p>
              <p className="text-muted-foreground">
                {outcomeDecision === "WON" ? `${translateI18n("projectDetail.finalContractValue")}: ${formatIdr(parsedFinalContractValue, 2)}` : `${translateI18n("copy.lossReason")}: ${lossReason}`}
              </p>
              <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                {translateI18n("copy.confirmOutcomeHelp")}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeOutcome} disabled={setProjectOutcome.isPending || evidence.isUploading}>
              {translateI18n("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={setProjectOutcome.isPending || evidence.isUploading || error === "businessAudit.stale"}
              className={outcomeDecision === "WON" && outcomeConfirming ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
            >
              {setProjectOutcome.isPending ? translateI18n("common.saving") : !outcomeConfirming ? translateI18n("copy.reviewBeforeSubmit") : outcomeDecision === "WON" ? translateI18n("projectDetail.recordWon") : translateI18n("projectDetail.recordLost")}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      {project.status === "COMPLETED" && (
        <div className="flex flex-col gap-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-success">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>{translateI18n("ui.projectCompleted")} - 100%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {translateI18n("projectDetail.resultComplete")}
            </p>
          </div>
          <Badge variant="success" className="self-start px-3 py-1 text-xs sm:self-auto">
            {formatProjectStatusLabel(project.status)}
          </Badge>
        </div>
      )}

      {/* ─── Draft Project Lifecycle Tracker ─── */}
      {isDraft && (
        <DraftProgressionTracker
          planApproval={planApproval}
          milestones={milestones}
          workflowModel={project.scenario?.workflow_model}
          workflowVersion={project.scenario?.workflow_version}
        />
      )}

      {isHeadSaPlanReviewWorkspace && (
        <section
          id="project-plan-review"
          tabIndex={-1}
          className="scroll-mt-20 space-y-5 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background"
          aria-labelledby="project-plan-review-heading"
        >
          <div className="max-w-2xl space-y-1 border-b border-border/60 pb-4">
            <h2 id="project-plan-review-heading" className="text-xl font-semibold text-foreground">
              {translateI18n("projectDetail.reviewPlan")}
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {translateI18n("projectDetail.reviewPlanHelp")}
            </p>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-6">
              <ProjectIntakeSection projectId={project.id} />
              <ProjectTimelineEditor
                projectId={id}
                milestones={milestones}
                canEdit={false}
                workflowModel={project.scenario?.workflow_model}
                workflowVersion={project.scenario?.workflow_version}
              />
            </div>

            <div className="xl:sticky xl:top-20 xl:self-start">
              <ProjectPlanCard
                onReviewDecision={openPlanReview}
                project={project}
                approval={planApproval}
                canSubmit={false}
                canReview
                onSubmit={() => undefined}
                isSubmitting={false}
                reviewWorkspace
              />
            </div>
          </div>
        </section>
      )}

      {/* ─── Timeline & Plan Review (Draft Stage) ─── */}
      {isDraft && !isHeadSaPlanReviewWorkspace && !isHeadSaWaitingForSalesPlan && (
        <div className="space-y-4">
          <div id="project-timeline" tabIndex={-1} className="scroll-mt-20 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background">
            {isSalesOwner && planApproval?.status === "REJECTED" && planApproval.review_note && (
              <div className="mb-4 border-l-2 border-destructive pl-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{translateI18n("copy.planInput")}</p>
                <p className="mt-1 leading-6">{planApproval.review_note}</p>
              </div>
            )}
            <ProjectTimelineEditor
              projectId={id}
              milestones={milestones}
              canEdit={isSalesOwner && planApproval?.status !== "PENDING"}
              workflowModel={project.scenario?.workflow_model}
              workflowVersion={project.scenario?.workflow_version}
            />
          </div>
          <div id="project-plan-review" tabIndex={-1} className="scroll-mt-24 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background">
            <ProjectPlanCard
                onReviewDecision={openPlanReview}
              project={project}
              approval={planApproval}
              canSubmit={showPlanCardSubmit}
              canReview={isHeadSa && planApproval?.status === "PENDING"}
              onSubmit={() => { submitProjectPlan.prepare?.(); setBusinessConfirmation("PLAN"); }}
              isSubmitting={submitProjectPlan.isPending}
            />
          </div>
        </div>
      )}

      {/* ─── Project Plan Card for Non-Draft (Read-only reference) ─── */}
      {!isDraft && planApproval && (
        <div id="project-plan-review" tabIndex={-1} className="scroll-mt-24 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background">
          <ProjectPlanCard
                onReviewDecision={openPlanReview}
            project={project}
            approval={planApproval}
            canSubmit={false}
            canReview={false}
            onSubmit={() => undefined}
            isSubmitting={false}
          />
        </div>
      )}

      {/* ─── PIC Assignment & History ─── */}
      {shouldShowProjectPic && (
        <div id="project-pic-assignment" tabIndex={-1} className="scroll-mt-20 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background">
          <PicAssignmentCard
            project={project}
            canAssign={isHeadSa && isActive && !isPostponed && (Boolean(project.pic) || assignPicIsCurrent)}
            unassignedNotice={projectPicNotice}
          />
        </div>
      )}

      {/* ─── Workflow Progress Bar ─── */}
      {!isDraft && (
        <section className="border-b border-border/60 pb-4" aria-labelledby="delivery-progress-heading">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h2 id="delivery-progress-heading" className="text-base font-semibold text-foreground">{translateI18n("copy.workProgress")}</h2>
              {progress && <p className="text-sm text-muted-foreground">{translateI18n("projectDetail.stagesFinished", { done: progress.completed, total: progress.total })}</p>}
            </div>
            {progress && (
              <span className={`text-sm font-medium ${isCompleted || progress.percentage === 100 ? "text-success" : "text-primary"}`}>
                {translateI18n("projectDetail.percentComplete", { percent: progress.percentage })}
              </span>
            )}
          </div>
          {milestonesError ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{translateI18n("dashboardPage.stageUnavailable")}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetchMilestones()}>{translateI18n("common.retry")}</Button>
            </div>
          ) : progress ? (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary/80">
              <div
                className={`h-full rounded-full transition-all duration-500 ${isCompleted || progress.percentage === 100 ? "bg-[hsl(var(--success))]" : "bg-primary"}`}
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{translateI18n("milestone.loading")}</p>
          )}
        </section>
      )}

      {!isHeadSaPlanReviewWorkspace && <ProjectIntakeSection projectId={project.id} />}
      {isDraft && <OutputScopeSection project={project} />}
      <ProjectDocumentsSection projectId={project.id} />

      {/* ─── Milestones Execution List & Activity Log ─── */}
      {!isDraft && (
      <div>
<Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base font-semibold tracking-tight">{translateI18n("ui.workStages")}</CardTitle>
                <CardDescription className="text-xs">
                  {translateI18n("ui.completedStagesHelp")}
                </CardDescription>
              </div>
              <Badge variant="outline" className="self-start text-xs sm:self-auto">
                {translateI18n("projectDetail.stageCount", { count: visibleWorkStages.length })}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {milestonesLoading ? (
              <p className="py-8 text-center text-muted-foreground">{translateI18n("milestone.loading")}</p>
            ) : visibleWorkStages.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{translateI18n("milestone.noMilestones")}</p>
            ) : (
              visibleWorkStages.map((milestone, index) => (
                <MilestoneRow
                  key={milestone.id}
                  displayIndex={index + 1}
                  project={project}
                  milestone={milestone}
                  isFinalMilestone={!milestones.some((candidate) => candidate.step_order > milestone.step_order)}
                  finalPrerequisitesComplete={milestones.every(candidate => candidate.id === milestone.id || ['COMPLETED','APPROVED'].includes(candidate.status))}
                  isCurrentStage={currentStageMilestone?.id === milestone.id}
                  hasNextCreatedMilestone={milestones.filter((candidate) => candidate.step_order > milestone.step_order)
                    .sort((left, right) => left.step_order - right.step_order)[0]?.status === "CREATED"}
                  approvalState={approvalByMilestone.get(milestone.id)}
                  expanded={expandedMilestones.has(milestone.id)}
                  onToggle={() => {
                    manuallyToggledMilestones.current.add(milestone.id);
                    setExpandedMilestones((current) => {
                      const next = new Set(current);
                      if (next.has(milestone.id)) next.delete(milestone.id);
                      else next.add(milestone.id);
                      return next;
                    });
                  }}
                />
              ))
            )}
          </CardContent>
        </Card>

      </div>
      )}

      {project.phases?.filter(phase => phase.id !== project.active_phase_id).map(phase => <details key={phase.id} className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">{phase.phase_key === 'PRA_TENDER' ? 'Pra-Tender' : 'On Submission Tender'} · {translateI18n('projectPhase.history')}</summary>
          {allMilestones.filter(milestone => milestone.phase_id === phase.id).map(milestone => <div key={milestone.id} id={`project-milestone-${milestone.id}`} className="mt-3 border-t border-border pt-2">
            <h4 className="text-sm font-medium">{milestone.name}</h4><p className="text-xs text-muted-foreground">{formatMilestoneDate(milestone.start_date)} · {formatMilestoneDate(milestone.due_date)}</p>
            <OutputDocumentsSection project={project} milestoneId={milestone.id} milestoneStatus={milestone.status} milestonePicId={milestone.pic_id} milestoneStartDate={milestone.start_date} />
          </div>)}
        </details>)}
        <ActivityTimeline project={project} milestones={allMilestones} />
      <AssignmentHistoryCard projectId={id} />

      {user?.role === "SUPER_ADMIN" && <ProjectDeletionDangerZone project={project} />}
      <PlanReviewDialog open={Boolean(planReviewTarget)} onOpenChange={open => !open && !reviewProjectPlan.isPending && setPlanReviewTarget(null)}
        decision={planReviewTarget?.decision || 'APPROVE'} projectName={planReviewTarget?.projectName || project.name}
        picRevision={project.pic_revision} currentPicId={project.pic?.id} currentPicName={project.pic?.full_name || project.pic?.fullName}
        phaseName={planReviewTarget?.phaseName || ''} targetApprovalId={planReviewTarget?.approvalId} approvalId={planApproval?.id} approvalStatus={planApproval?.status}
        workflowModel={project.active_scenario?.workflow_model || project.scenario?.workflow_model}
        workflowVersion={project.active_scenario?.workflow_version || project.scenario?.workflow_version}
        onConflictReload={async () => { await refetchProject({ throwOnError: true }); }}
        isPending={reviewProjectPlan.isPending} onSubmit={savePlanReview} />
      <PostponeProjectDialog open={postponeOpen} onOpenChange={setPostponeOpen} project={project} />
    </div>
  );
}
