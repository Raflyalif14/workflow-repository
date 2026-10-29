"use client";
import { compareMilestoneSchedule, getScheduledWorkStage } from '@/lib/milestone-order';
import { projectDisplayStatus } from '@/lib/project-display-status';
import { useOutcomeEvidence } from '@/hooks/use-outcome-evidence';
import { OutcomeEvidenceField } from '@/components/projects/outcome-evidence-field';

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
import { AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, Clock3, PauseCircle } from "lucide-react";
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
import { MilestoneApprovalState, useMilestoneApprovalStates } from "@/hooks/use-milestone-workflow";
import { ActivityTimeline } from "@/components/projects/project-activity-timeline";
import { ProjectIntakeSection } from "@/components/projects/project-intake-section";
import { NextActionCard, DraftProgressionTracker, ProjectPlanCard } from "@/components/projects/project-plan-summary";
import { MilestoneRow } from "@/components/projects/project-milestone-row";
import { PlanReviewDialog } from "@/components/projects/project-plan-review-dialog";
import { StatusBadge } from "@/components/projects/project-status-badge";
import { formatIdr, formatDateTime } from "@/lib/project-detail-format";

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
        <Button variant="outline" size="sm" onClick={() => router.push("/projects")}>
          {translateI18n("copy.backToProject")}
        </Button>
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
  const assignPicIsCurrent = milestones.some(
    (m) => m.status === "IN_PROGRESS" && m.name.trim().toLowerCase() === "assign pic"
  );
  const nextAction = resolveNextAction(project, milestones, planApproval, {
    id: user?.id,
    role: user?.role,
    fullName: user?.fullName,
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

  const recordOutcome = async () => {
    if (!outcomeDecision || outcomeSaving.current || error === "businessAudit.stale") return;
    setError("");
    setMessage("");
    const parsedFinalContractValue = Number(finalContractValue);
    if (outcomeDecision === "WON" && (!finalContractValue.trim() || !Number.isFinite(parsedFinalContractValue) || parsedFinalContractValue <= 0)) {
      setError("projectDetail.wonValueRequired");
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
        finalContractValue: outcomeDecision === "WON" ? parsedFinalContractValue : undefined,
        lossReason: outcomeDecision === "LOST" ? lossReason : undefined,
      });
      setMessage(outcomeDecision === "WON" ? "projectDetail.resultWon" : "projectDetail.resultLost");
      setOutcomeDecision(null); setOutcomeConfirming(false);
      setFinalContractValue("");
      setLossReason("");
      evidence.reset();
    } catch (outcomeError) {
      setError(outcomeError instanceof ApiError && outcomeError.status === 409 ? "businessAudit.stale" : "projectDetail.resultFailed");
    } finally { outcomeSaving.current = false; }
  };

  const handleNextAction = () => {
    switch (nextAction.actionType) {
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
      <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => router.push("/projects")}>
        <ArrowLeft className="h-4 w-4" />
        <span>{translateI18n("copy.backToProject")}</span>
      </Button>

      {/* Header */}
      <header className="flex flex-col gap-4 pb-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-4xl space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <StatusBadge status={project.status} label={projectDisplayStatus(project)} />
          </div>
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{project.name}</h1>
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
            {translateI18n("projectDetail.customer")} <strong className="text-foreground">{project.customer}</strong> · {translateI18n("projectDetail.scenario")}{" "}
            <strong className="text-foreground">{project.scenario?.name || translateI18n("ui.noScenario")}</strong>
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

      {/* ─── Next Action Card ─── */}
      {!isPraTenderDecisionPending(project) && !isProjectClosedAtPraTender(project) && <NextActionCard
        nextAction={nextAction}
        onAction={handleNextAction}
        isSubmittingPlan={submitProjectPlan.isPending}
        isResuming={resumeProject.isPending}
      />}

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
                className="flex-1 sm:flex-none"
                disabled={setProjectOutcome.isPending || evidence.isUploading}
                onClick={() => {
                  setError("");
                  setOutcomeDecision("WON");
                }}
              >
                {translateI18n("projectDetail.recordWon")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-1 sm:flex-none"
                disabled={setProjectOutcome.isPending || evidence.isUploading}
                onClick={() => {
                  setError("");
                  setOutcomeDecision("LOST");
                }}
              >
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
          if (!open && !setProjectOutcome.isPending && !outcomeSaving.current) { setOutcomeDecision(null); setOutcomeConfirming(false); setError(""); }
        }}
      >
        <DialogHeader>
          <DialogTitle>{translateI18n(!outcomeConfirming ? "reviewConfirm.continue" : outcomeDecision === "WON" ? "projectDetail.recordWon" : "projectDetail.recordLost")}</DialogTitle>
          <DialogDescription>
            {outcomeDecision === "WON"
              ? translateI18n("projectDetail.wonValueRequired")
              : translateI18n("projectDetail.lossReasonRequired")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void recordOutcome();
          }}
        >
          {outcomeDecision === "WON" ? (
            <div>
              <label htmlFor="final-contract-value" className="mb-1 block text-xs font-semibold text-muted-foreground">
                {translateI18n("projectDetail.finalContractValue")}
              </label>
              <Input
                id="final-contract-value"
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={finalContractValue}
                onChange={(event) => { setProjectOutcome.prepare?.(); setFinalContractValue(event.target.value); setOutcomeConfirming(false); }}
                disabled={setProjectOutcome.isPending || evidence.isUploading}
                required
              />
            </div>
          ) : (
            <div>
              <label htmlFor="loss-reason" className="mb-1 block text-xs font-semibold text-muted-foreground">
                {translateI18n("copy.lossReason")}
              </label>
              <textarea
                id="loss-reason"
                value={lossReason}
                onChange={(event) => { setProjectOutcome.prepare?.(); setLossReason(event.target.value); setOutcomeConfirming(false); }}
                className="min-h-24 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                disabled={setProjectOutcome.isPending || evidence.isUploading}
                maxLength={2000}
                required
              />
            </div>
          )}
          <OutcomeEvidenceField files={evidence.files} onChange={files => { evidence.setFiles(files); setOutcomeConfirming(false); }} disabled={setProjectOutcome.isPending || evidence.isUploading} />
          {outcomeConfirming && <p className="whitespace-pre-wrap text-sm">{translateI18n("businessAudit.final")} {project.name}: {formatProjectStatusLabel(project.status)} {" -> "} {formatProjectStatusLabel(outcomeDecision || "")} - {outcomeDecision === "WON" ? formatIdr(Number(finalContractValue)) : lossReason}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setOutcomeDecision(null); setOutcomeConfirming(false); setError(""); }} disabled={setProjectOutcome.isPending || evidence.isUploading}>
              {translateI18n("common.cancel")}
            </Button>
            <Button type="submit" disabled={setProjectOutcome.isPending || error === "businessAudit.stale"}>
              {setProjectOutcome.isPending ? translateI18n("common.saving") : translateI18n(!outcomeConfirming ? "reviewConfirm.continue" : outcomeDecision === "WON" ? "projectDetail.recordWon" : "projectDetail.recordLost")}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      {(project.status === "WON" || project.status === "LOST" || project.status === "COMPLETED") && (
        <div className={`flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 ${project.status === "LOST" ? "border-destructive/30 bg-destructive/10" : "border-emerald-500/30 bg-emerald-500/10"}`}>
          <div className="space-y-1">
            <div className={`flex items-center gap-2 text-sm font-semibold tracking-tight ${project.status === "LOST" ? "text-destructive" : "text-success"}`}>
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>{translateI18n(project.status === "COMPLETED" ? "ui.projectCompleted" : project.status === "WON" ? "ui.projectWon" : "ui.projectLost")} - 100%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {translateI18n("projectDetail.resultComplete")}
            </p>
            {project.status === "WON" && (
              <p className="text-xs text-muted-foreground">{translateI18n("projectDetail.finalValueShown", { value: formatIdr(project.final_contract_value) })}</p>
            )}
            {project.status === "LOST" && project.loss_reason && (
              <p className="text-xs text-muted-foreground">{translateI18n("projectDetail.lossReasonShown", { reason: project.loss_reason })}</p>
            )}
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
            {progress && <span className="text-sm font-medium text-primary">{translateI18n("projectDetail.percentComplete", { percent: progress.percentage })}</span>}
          </div>
          {milestonesError ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{translateI18n("dashboardPage.stageUnavailable")}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetchMilestones()}>{translateI18n("common.retry")}</Button>
            </div>
          ) : progress ? (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary/80">
              <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress.percentage}%` }} />
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
                {translateI18n("projectDetail.stageCount", { count: milestones.length })}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {milestonesLoading ? (
              <p className="py-8 text-center text-muted-foreground">{translateI18n("milestone.loading")}</p>
            ) : milestones.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{translateI18n("milestone.noMilestones")}</p>
            ) : (
              milestones.map((milestone) => (
                <MilestoneRow
                  key={milestone.id}
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
        picRevision={project.pic_revision} currentPicName={project.pic?.full_name || project.pic?.fullName}
        phaseName={planReviewTarget?.phaseName || ''} targetApprovalId={planReviewTarget?.approvalId} approvalId={planApproval?.id} approvalStatus={planApproval?.status}
        workflowModel={project.active_scenario?.workflow_model || project.scenario?.workflow_model}
        workflowVersion={project.active_scenario?.workflow_version || project.scenario?.workflow_version}
        onConflictReload={async () => { await refetchProject({ throwOnError: true }); }}
        isPending={reviewProjectPlan.isPending} onSubmit={savePlanReview} />
      <PostponeProjectDialog open={postponeOpen} onOpenChange={setPostponeOpen} project={project} />
    </div>
  );
}
