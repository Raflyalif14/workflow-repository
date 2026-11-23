"use client";

import { BusinessConfirmation } from "@/components/projects/business-confirmation";
import { useOutcomeEvidence } from '@/hooks/use-outcome-evidence';
import { OutcomeEvidenceField } from './outcome-evidence-field';
import { ApiError } from "@/lib/api-client";
import { triggerWonConfetti } from "@/lib/confetti";
import { translate as translateI18n, translateOutputName, translateStoredError, translateStoredMessage } from "@/i18n";
import { useRef, useState } from "react";
import { CalendarClock, Check, CheckCircle2, ChevronDown, FileText, RotateCcw, Trophy, UploadCloud, Users, XCircle } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { MilestoneContributionsPanel } from "@/components/milestones/milestone-contributions-panel";
import { SalesMilestoneDocumentUploadDialog } from "@/components/projects/sales-milestone-document-upload-dialog";
import { OutputDocumentsSection } from "@/components/projects/output-documents-section";
import { useOutputDocuments } from "@/hooks/use-output-documents";
import { visibleMilestoneOutputCounts } from "@/lib/milestone-presentation";
import { canUploadSalesMilestoneDocuments } from "@/lib/sales-milestone-document-ux";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DeadlineHealthPresentation,
  getDeadlineHealthPresentation,
  getEffectiveDeadline,
  getMilestoneDisplayStatus,
  isMilestoneCompleted,
} from "@/lib/milestone-ui-state";
import {
  formatMilestoneStatusLabel,
  formatProjectStatusLabel,
  isDeadlineChangeStepEligible,
} from "@/lib/workflow-ux-helpers";
import { isInitialSubmissionBeforeEffectiveStart } from "@/lib/dates";
import {
  canAddMilestoneContribution,
  canPromoteMilestoneContributions,
  canViewMilestoneContributions,
} from "@/lib/milestone-contribution-access";
import {
  MilestoneApprovalState,
  useCompleteMilestone,
  useStartMilestone,
  useMilestoneDeadlineStatus,
  useRetryMilestoneProgression,
} from "@/hooks/use-milestone-workflow";
import { DeadlineApprovalStatus, Project, ProjectMilestonePhase4 } from "@/types/project";
import { DeadlineDialog, DeadlineReviewDialog } from "@/components/projects/milestone-deadline-dialogs";
import { StatusBadge } from "@/components/projects/project-status-badge";
import { formatIdr, formatDate } from "@/lib/project-detail-format";
import { salesStageAction } from '@/lib/sales-stage-action';
import { formatContractAmountInput, parseContractAmount } from '@/lib/contract-amount';

export function MilestoneRow({
  project,
  milestone,
  displayIndex,
  isFinalMilestone,
  isCurrentStage,
  hasNextCreatedMilestone,
  finalPrerequisitesComplete = true,
  resultOnly = false,
  approvalState,
  expanded,
  onToggle,
}: {
  project: Project;
  milestone: ProjectMilestonePhase4;
  displayIndex?: number;
  isFinalMilestone: boolean;
  isCurrentStage: boolean;
  hasNextCreatedMilestone: boolean;
  finalPrerequisitesComplete?: boolean;
  resultOnly?: boolean;
  approvalState?: MilestoneApprovalState;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { user } = useAuth();
  const evidence = useOutcomeEvidence(project.id);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [salesDocumentUploadOpen, setSalesDocumentUploadOpen] = useState(false);
  const [completionConfirming, setCompletionConfirming] = useState(false);
  const finalSaving = useRef(false);
  const [finalConfirming, setFinalConfirming] = useState(false);
  const [finalOutcomeOpen, setFinalOutcomeOpen] = useState(false);
  const [finalOutcome, setFinalOutcome] = useState<"WON" | "LOST" | null>(null);
  const [finalValue, setFinalValue] = useState("");
  const [finalLossReason, setFinalLossReason] = useState("");
  const [review, setReview] = useState<null | { type: "DEADLINE"; decision: "APPROVE" | "REJECT" }>(null);
  const [error, setError] = useState("");
  const [evidenceErrorTrigger, setEvidenceErrorTrigger] = useState(0);
  const [message, setMessage] = useState("");
  const [uploadedDocumentCount, setUploadedDocumentCount] = useState(0);

  const deadlineApproval = approvalState?.deadlineApproval || null;
  const deadlineStatusQuery = useMilestoneDeadlineStatus(milestone.id);
  const milestoneOutputs = useOutputDocuments(project.id);
  const milestoneStatus = getMilestoneDisplayStatus(milestone);
  const effectiveDeadline = getEffectiveDeadline(milestone);
  const stageRole = milestone.workflow_stage?.default_role;
  const isSalesOwner = user?.role === "SALES" && project.sales_id === user.id;
  const isHeadSa = user?.role === "HEAD_SA";
  const isAssignedPic =
    (user?.role === "SA" || user?.role === "HEAD_SA") && milestone.pic_id === user.id;
  // Created stages acquire the project PIC when the guarded Start RPC runs.
  const isStartPic = (user?.role === 'SA' || user?.role === 'HEAD_SA')
    && (milestone.pic_id || project.pic?.id) === user.id;
  const selectedMilestoneOutputs = (milestoneOutputs.data?.documents || []).filter((output) =>
    output.milestoneId === milestone.id && (output.isRequired || output.isSelected));
  const outputCounts = visibleMilestoneOutputCounts(milestoneOutputs.data?.documents || [], milestone.id, isHeadSa || isAssignedPic);
  const hasNoSelectedOutput = !milestoneOutputs.isLoading && !milestoneOutputs.isError && selectedMilestoneOutputs.length === 0;
  const allSelectedOutputsApproved = selectedMilestoneOutputs.length > 0
    && selectedMilestoneOutputs.every((output) => output.status === "APPROVED");
  const projectIsActive = project.status === "ACTIVE" && !project.is_postponed;
  const isAssignPic = milestone.name.trim().toLowerCase() === "assign pic";
  const isCompleted = isMilestoneCompleted(milestone);

  const hasPendingDeadline = deadlineApproval?.status === "PENDING";
  const deadlineHealth: DeadlineHealthPresentation = deadlineStatusQuery.isLoading
    ? { label: "Checking...", tone: "neutral" }
    : deadlineStatusQuery.isError || !deadlineStatusQuery.data
    ? { label: "Unavailable", tone: "neutral" }
    : getDeadlineHealthPresentation(
        deadlineStatusQuery.data.deadline_status,
        deadlineStatusQuery.data.remaining_working_days
      );

  const canComplete =
    projectIsActive &&
    milestoneStatus === "IN_PROGRESS" &&
    !isAssignPic &&
    ((stageRole === "SALES" && isSalesOwner) || (stageRole === "HEAD_SA" && isHeadSa)
      || (stageRole === "SA" && isAssignedPic && hasNoSelectedOutput
        && !isInitialSubmissionBeforeEffectiveStart(milestone.start_date, false)));

  const canReviewDeadline = projectIsActive && isHeadSa && hasPendingDeadline;
  const canRequestDeadlineChange =
    projectIsActive &&
    isSalesOwner &&
    isDeadlineChangeStepEligible(
      milestone.step_order,
      project.scenario?.workflow_model,
      project.scenario?.workflow_version
    ) &&
    !isCompleted &&
    !hasPendingDeadline;
  const canUploadSalesDocuments = canUploadSalesMilestoneDocuments(
    user,
    {
      salesId: project.sales_id,
      status: project.status,
      isPostponed: project.is_postponed,
    },
    { status: milestoneStatus, stageRole }
  );
  const contributionProject = {
    salesId: project.sales_id,
    status: project.status,
    isPostponed: project.is_postponed,
    workflowModel: project.scenario?.workflow_model,
    workflowVersion: project.scenario?.workflow_version,
  };
  const contributionMilestone = {
    stepOrder: milestone.step_order,
    status: milestone.status,
    picId: milestone.pic_id,
  };
  const canReadContributions = canViewMilestoneContributions(user, contributionProject, contributionMilestone);
  const canCreateContribution = canAddMilestoneContribution(user, contributionProject, contributionMilestone);
  const canPromoteContributions = canPromoteMilestoneContributions(user, contributionProject, contributionMilestone);

  const complete = useCompleteMilestone(project.id, milestone.id);
  const startMilestone = useStartMilestone(project.id, milestone.id);
  const canStart = projectIsActive && milestoneStatus === 'CREATED' && !isAssignPic
    && !!milestone.start_date && !isInitialSubmissionBeforeEffectiveStart(milestone.start_date, false)
    && ((stageRole === 'SALES' && isSalesOwner && (!isFinalMilestone || finalPrerequisitesComplete))
        || stageRole === 'HEAD_SA' && isHeadSa || stageRole === 'SA' && isStartPic);
  const retryProgression = useRetryMilestoneProgression(project.id, milestone.id);
  const requiresFinalOutcome = canComplete && stageRole === "SALES" && isFinalMilestone;
  const salesAction = projectIsActive && stageRole === 'SALES'
    ? salesStageAction(milestoneStatus, milestone.start_date, isFinalMilestone, finalPrerequisitesComplete) : null;
  const salesOwnerName = project.sales?.full_name || project.sales?.fullName || translateI18n('role.SALES');

  const finalAmount = parseContractAmount(finalValue);

  const resetFinalOutcome = () => {
    setFinalOutcomeOpen(false);
    setFinalConfirming(false);
    setFinalOutcome(null);
    setFinalValue("");
    setFinalLossReason("");
    setError("");
    evidence.reset();
  };

  const closeFinalOutcome = async () => {
    if (finalSaving.current || complete.isPending || evidence.isUploading) return;
    try {
      if (await evidence.discard()) resetFinalOutcome();
    } catch {
      setError('workflowUpdate.evidenceDiscardFailed');
    }
  };

  const completeFinalSalesMilestone = async () => {
    if (finalSaving.current) return;
    setError("");
    setMessage("");
    if (!finalOutcome) {
      setError("projectDetail.chooseOutcome");
      return;
    }
    if (finalOutcome === "WON" && finalAmount === null) {
      setError("projectDetail.finalValueInvalid");
      return;
    }
    if (finalOutcome === "LOST" && !finalLossReason.trim()) {
      setError("projectDetail.lossRequired");
      return;
    }
    if (!evidence.files.length) {
      setError('workflowUpdate.evidenceRequired');
      setEvidenceErrorTrigger(c => c + 1);
      return;
    }
    if (!finalConfirming) { setFinalConfirming(true); return; }
    finalSaving.current = true;
    try {
      const evidenceIds = await evidence.prepare();
      await complete.mutateAsync({
        evidence_document_ids: evidenceIds,
        outcome: finalOutcome,
        ...(finalOutcome === "WON" ? { final_contract_value: finalAmount ?? undefined } : { loss_reason: finalLossReason.trim() }),
      });
      if (finalOutcome === "WON") {
        triggerWonConfetti();
      }
      resetFinalOutcome();
      setMessage("projectDetail.finalMilestoneComplete");
    } catch (completionError: any) {
      const errKey = completionError instanceof Error ? completionError.message : "";
      setError(
        errKey === "workflowUpdate.evidenceRequired"
          ? errKey
          : completionError instanceof ApiError && completionError.status === 409
          ? "businessAudit.stale"
          : "projectDetail.finalCompletionFailed"
      );
    } finally { finalSaving.current = false; }
  };

  const perform = async (action: () => Promise<unknown>, success: string, fallback: string) => {
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (actionError) {
      setError(fallback);
    }
  };

  const secondaryActions = <>
          {canRequestDeadlineChange && (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setDeadlineOpen(true)}>
              <CalendarClock className="h-3.5 w-3.5" />
              <span>{translateI18n("copy.requestDeadline")}</span>
            </Button>
          )}
          {canUploadSalesDocuments && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setSalesDocumentUploadOpen(true)}
            >
              <UploadCloud className="h-3.5 w-3.5" />
              <span>{translateI18n("documents.upload")}</span>
            </Button>
          )}
  </>;

  const finalOutcomeDialog = (
    <Dialog open={finalOutcomeOpen} onOpenChange={(open) => { if (!open) return closeFinalOutcome(); }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {finalOutcome === "WON" ? (
              <>
                <Trophy className="h-5 w-5 text-emerald-600" />
                <span>{translateI18n(resultOnly ? 'salesStage.result' : 'copy.completeSales')} — {translateI18n("projectStatus.WON")}</span>
              </>
            ) : finalOutcome === "LOST" ? (
              <>
                <XCircle className="h-5 w-5 text-destructive" />
                <span>{translateI18n(resultOnly ? 'salesStage.result' : 'copy.completeSales')} — {translateI18n("projectStatus.LOST")}</span>
              </>
            ) : (
              <span>{translateI18n(resultOnly ? 'salesStage.result' : 'copy.completeSales')}</span>
            )}
          </DialogTitle>
          <DialogDescription>{resultOnly ? translateI18n('salesStage.recordHelp') : translateI18n('projectDetail.recordResultWithMilestone', { name: milestone.name })}</DialogDescription>
        </DialogHeader>

        {/* WON vs LOST Toggle Switch */}
        <div className="grid grid-cols-2 gap-2 pt-1 pb-1">
          <button
            type="button"
            onClick={() => {
              setFinalOutcome("WON");
              setFinalConfirming(false);
              setError("");
              if (!finalValue && project.estimated_revenue) {
                setFinalValue(formatContractAmountInput(String(project.estimated_revenue), "", "insertText"));
              }
            }}
            disabled={complete.isPending || evidence.isUploading}
            className={`flex items-center justify-center gap-2 rounded-xl border-2 p-2.5 text-xs font-semibold transition-all ${
              finalOutcome === "WON"
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
              setFinalOutcome("LOST");
              setFinalConfirming(false);
              setError("");
            }}
            disabled={complete.isPending || evidence.isUploading}
            className={`flex items-center justify-center gap-2 rounded-xl border-2 p-2.5 text-xs font-semibold transition-all ${
              finalOutcome === "LOST"
                ? "border-destructive bg-destructive/10 text-destructive shadow-sm"
                : "border-border/60 bg-card hover:bg-muted text-muted-foreground"
            }`}
          >
            <XCircle className="h-4 w-4" />
            <span>{translateI18n("projectStatus.LOST")}</span>
          </button>
        </div>

        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void completeFinalSalesMilestone(); }}>
          {finalOutcome === "WON" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor={`contract-${milestone.id}`} className="block text-xs font-semibold text-muted-foreground">{translateI18n("copy.finalContractIdr")}</label>
                {project.estimated_revenue && (
                  <button
                    type="button"
                    onClick={() => {
                      setFinalValue(formatContractAmountInput(String(project.estimated_revenue), "", "insertText"));
                      setFinalConfirming(false);
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
                <Input id={`contract-${milestone.id}`} type="text" inputMode="decimal" value={finalValue}
                  className="pl-10 font-semibold text-base"
                  placeholder="100.000.000"
                  onChange={(event) => {
                    setFinalValue(formatContractAmountInput(event.target.value, finalValue, (event.nativeEvent as InputEvent).inputType));
                    setFinalConfirming(false);
                    setError("");
                  }} disabled={complete.isPending || evidence.isUploading} required />
              </div>
              {project.estimated_revenue && (
                <p className="text-[11px] text-muted-foreground">
                  💡 {translateI18n("copy.autoFilledFromEstimate")}
                </p>
              )}
            </div>
          )}
          {finalOutcome === "LOST" && (
            <div className="space-y-2">
              <label htmlFor={`loss-${milestone.id}`} className="block text-xs font-semibold text-muted-foreground">{translateI18n("copy.lossReason")}</label>
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">{translateI18n("copy.lossReasonSuggestions")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {(["copy.lossReasonPrice", "copy.lossReasonSpec", "copy.lossReasonCancelled", "copy.lossReasonCompetitor", "copy.lossReasonSchedule"] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setFinalLossReason(translateI18n(key));
                        setFinalConfirming(false);
                      }}
                      className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      disabled={complete.isPending || evidence.isUploading}
                    >
                      {translateI18n(key)}
                    </button>
                  ))}
                </div>
              </div>
              <textarea id={`loss-${milestone.id}`} className="min-h-20 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder={translateI18n("copy.lossReasonPlaceholder")} value={finalLossReason} onChange={(event) => { setFinalLossReason(event.target.value); setFinalConfirming(false); }} maxLength={2000} disabled={complete.isPending || evidence.isUploading} required />
            </div>
          )}
          {error && <p role="alert" className="text-xs text-destructive">{translateStoredError(error)}</p>}
          <OutcomeEvidenceField
            files={evidence.files}
            onChange={files => { evidence.setFiles(files); setFinalConfirming(false); }}
            disabled={complete.isPending || evidence.isUploading}
            hasError={error === 'workflowUpdate.evidenceRequired'}
            errorTrigger={evidenceErrorTrigger}
          />
          {finalConfirming && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-1.5 text-xs">
              <p className="font-semibold text-primary">{translateI18n("copy.confirmOutcomeTitle")}</p>
              <p className="text-foreground">
                <span className="text-muted-foreground">{translateI18n("copy.projectColon")}</span> <strong>{project.name}</strong>{!resultOnly && ` - ${milestone.name}`}
              </p>
              <p className="text-foreground">
                <span className="text-muted-foreground">{translateI18n("copy.statusLabel")}</span> {formatProjectStatusLabel(project.status)} {" → "} <strong>{formatProjectStatusLabel(finalOutcome || "")}</strong>
              </p>
              <p className="text-muted-foreground">
                {finalOutcome === "WON" ? `${translateI18n("copy.finalContractIdr")}: ${formatIdr(finalAmount, 2)}` : `${translateI18n("copy.lossReason")}: ${finalLossReason}`}
              </p>
              <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                {translateI18n("copy.confirmOutcomeHelp")}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeFinalOutcome} disabled={complete.isPending || evidence.isUploading}>{translateI18n("common.cancel")}</Button>
            <Button
              type="submit"
              disabled={complete.isPending || evidence.isUploading || !finalOutcome}
              className={finalOutcome === "WON" && finalConfirming ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
            >
              {translateI18n(complete.isPending ? "projectDetail.completing" : !finalConfirming ? "copy.reviewBeforeSubmit" : (resultOnly ? "salesStage.saveResult" : "projectDetail.completeAndRecord"))}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
  );

  if (resultOnly) {
    if (!isSalesOwner || !projectIsActive || isCompleted) return null;
    const ready = finalPrerequisitesComplete && (salesAction === 'START' || salesAction === 'RESULT');
    const hint = !finalPrerequisitesComplete ? 'salesStage.resultWaitWork'
      : salesAction === 'WAIT_DATE' ? 'salesStage.resultWaitDate'
      : salesAction === 'NO_SCHEDULE' ? 'salesStage.resultNoSchedule'
      : 'salesStage.recordHelp';
    return (
      <section id={`project-milestone-${milestone.id}`} tabIndex={-1} className="page-surface scroll-mt-20 space-y-3 p-4 sm:p-5">
        <h2 className="text-lg font-semibold">{translateI18n('salesStage.resultTitle')}</h2>
        <p className="text-sm text-muted-foreground">{translateI18n(hint, { date: formatDate(milestone.start_date) })}</p>
        {ready && (
          <Button
            type="button"
            onClick={() => {
              setFinalOutcomeOpen(true);
              setFinalOutcome("WON");
              if (!finalValue && project.estimated_revenue) {
                setFinalValue(formatContractAmountInput(String(project.estimated_revenue), "", "insertText"));
              }
            }}
            disabled={complete.isPending || evidence.isUploading}
          >
            {translateI18n('salesStage.result')}
          </Button>
        )}
        {finalOutcomeDialog}
      </section>
    );
  }

  return (
    <div
      id={`project-milestone-${milestone.id}`}
      tabIndex={-1}
      className={`scroll-mt-20 rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background ${
        isCurrentStage
          ? "border-primary/40 bg-card"
          : isCompleted
          ? "border-border/50 bg-muted/20"
          : "border-border/60 bg-card/50 hover:border-border/80"
      }`}
    >
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                isCompleted
                  ? "bg-emerald-500/20 text-success"
                  : isCurrentStage
                  ? "bg-primary text-primary-foreground font-bold"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {isCompleted ? <Check className="h-3.5 w-3.5" /> : String(displayIndex ?? milestone.step_order).padStart(2, "0")}
            </span>
            <h3 className="min-w-0 break-words text-sm font-semibold text-foreground sm:text-base">
              {selectedMilestoneOutputs.length === 1
                ? translateOutputName(selectedMilestoneOutputs[0].key, selectedMilestoneOutputs[0].name)
                : milestone.name}
            </h3>
            <StatusBadge status={milestoneStatus} />
            {isCurrentStage && (
              <span className="text-xs font-medium text-primary">
                {translateI18n("copy.currentWork")}
              </span>
            )}
            {selectedMilestoneOutputs.length > 1 && (
              <Badge variant="outline" className="gap-1 border-border/70 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                <FileText className="h-3 w-3 text-primary/70" />
                {translateI18n("milestoneCompact.outputCountBadge", { count: selectedMilestoneOutputs.length })}
              </Badge>
            )}
            {outputCounts.inReview > 0 && <Badge variant="outline" className="border-blue-500/30 text-primary">{translateI18n("milestoneCompact.awaitingReview", { count: outputCounts.inReview })}</Badge>}
            {outputCounts.revisionRequired > 0 && <Badge variant="destructive">{translateI18n("milestoneCompact.needsRevision", { count: outputCounts.revisionRequired })}</Badge>}
            {hasPendingDeadline && <Badge variant="warning">{translateI18n("copy.deadlinePending")}</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-0 text-xs text-muted-foreground sm:pl-9">
            <span>{stageRole === 'SALES' ? translateI18n('role.SALES') : translateI18n("milestoneCompact.pic")}: <strong className="font-medium text-foreground">{stageRole === 'SALES' ? salesOwnerName : milestone.pic?.full_name || milestone.pic?.fullName || translateI18n("milestoneCompact.unassigned")}</strong></span>
            <span>{translateI18n("milestoneCompact.due")}: <strong className="font-medium text-foreground">{formatDate(milestone.due_date)}</strong></span>
            {!deadlineStatusQuery.isLoading && !deadlineStatusQuery.isError && <span className={deadlineHealth.tone === "destructive" ? "font-medium text-destructive" : deadlineHealth.tone === "warning" ? "font-medium text-warning" : ""}>{translateI18n(`milestoneCompact.deadline_${deadlineStatusQuery.data?.deadline_status || "NOT_SET"}`)}</span>}
            {stageRole === "SA" && !milestoneOutputs.isLoading && !milestoneOutputs.isError && (
              <span className="font-medium text-foreground">{outputCounts.total === null
                ? translateI18n("milestoneCompact.approvedVisible", { count: outputCounts.approved })
                : translateI18n("milestoneCompact.approvedProgress", { approved: outputCounts.approved, total: outputCounts.total })}</span>
            )}
          </div>
        </div>
        {isSalesOwner && salesAction === 'START' && canStart && <Button type="button" size="sm" disabled={startMilestone.isPending} onClick={() => void perform(() => startMilestone.mutateAsync(), 'milestoneStatus.IN_PROGRESS', 'workflowUpdate.startFailed')}>{translateI18n('salesStage.start')}</Button>}
        {isSalesOwner && requiresFinalOutcome && <Button type="button" size="sm" disabled={complete.isPending} onClick={() => setFinalOutcomeOpen(true)}>{translateI18n('salesStage.result')}</Button>}
        <Button type="button" size="sm" variant="ghost" className="min-h-9 shrink-0 self-start gap-1.5 sm:self-center"
          aria-expanded={expanded} aria-controls={`milestone-panel-${milestone.id}`} onClick={onToggle}>
          {expanded ? translateI18n("milestoneCompact.hideDetails") : translateI18n("milestoneCompact.showDetails")}
          {expanded ? <ChevronDown className="h-4 w-4 rotate-180" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {salesAction && <p className="px-4 pb-3 text-xs text-primary sm:pl-16">{translateI18n(`salesStage.${salesAction}`, {date: formatDate(milestone.start_date)})}</p>}

      {!expanded && <div id={`milestone-panel-${milestone.id}`} hidden />}
      {expanded && <div id={`milestone-panel-${milestone.id}`} className="min-w-0 border-t border-border/50 px-3 pb-3 pt-3 sm:px-4">
        {milestone.description && <p className="mb-3 text-sm text-muted-foreground">{milestone.description}</p>}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          {canStart && !(stageRole === 'SALES' && isSalesOwner) && <Button size="sm" disabled={startMilestone.isPending} onClick={() => void perform(() => startMilestone.mutateAsync(), 'milestoneStatus.IN_PROGRESS', 'workflowUpdate.startFailed')}>{translateI18n('workflowUpdate.start')}</Button>}
          {stageRole === 'SALES' && isFinalMilestone ? (
            (canRequestDeadlineChange || canUploadSalesDocuments) && <details className="w-full text-sm">
              <summary className="w-fit cursor-pointer rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary">{translateI18n('salesStage.more')}</summary>
              <p className="mt-2 text-xs text-muted-foreground">{translateI18n('salesStage.moreHelp')}</p>
              <div className="mt-2 flex flex-wrap gap-2">{secondaryActions}</div>
            </details>
          ) : secondaryActions}
          {canComplete && !requiresFinalOutcome && (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={complete.isPending || evidence.isUploading}
              onClick={() => requiresFinalOutcome
                ? setFinalOutcomeOpen(true)
                : setCompletionConfirming(true)}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{complete.isPending ? translateI18n("outputScope.completing") : stageRole === "SA" ? translateI18n("outputScope.completeLegacy") : translateI18n("outputScope.markComplete")}</span>
            </Button>
          )}
          {stageRole === "SA" && milestoneStatus === "COMPLETED" && hasNextCreatedMilestone && projectIsActive
            && (isHeadSa || isAssignedPic) && (
            <Button size="sm" variant="outline" disabled={retryProgression.isPending}
              onClick={() => void perform(() => retryProgression.mutateAsync(), "projectDetail.workflowChecked", "projectDetail.workflowRetryFailed")}>
              <RotateCcw className="h-3.5 w-3.5" /> {translateI18n("projectDetail.continueWorkflow")}
            </Button>
          )}
          {stageRole === "SA" && milestoneStatus === "IN_PROGRESS" && allSelectedOutputsApproved
            && (isHeadSa || isAssignedPic) && projectIsActive && (
            <Button size="sm" variant="outline" disabled={retryProgression.isPending}
              onClick={() => void perform(() => retryProgression.mutateAsync(), "projectDetail.workflowChecked", "projectDetail.workflowRetryFailed")}>
              <RotateCcw className="h-3.5 w-3.5" /> {translateI18n("projectDetail.continueWorkflow")}
            </Button>
          )}
          {canReviewDeadline && (
            <>
              <Button size="sm" variant="outline" className="h-8 text-xs border-destructive/30 text-destructive" onClick={() => setReview({ type: "DEADLINE", decision: "REJECT" })}>
                {translateI18n("projectDetail.rejectRequest")}
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={() => setReview({ type: "DEADLINE", decision: "APPROVE" })}>
                {translateI18n("projectDetail.approveDeadline")}
              </Button>
            </>
          )}
        </div>

      {stageRole === "SA" && (
        <div className="mt-3">
          <OutputDocumentsSection project={project} milestoneId={milestone.id} milestoneStatus={milestoneStatus} milestoneStartDate={milestone.start_date} milestonePicId={milestone.pic_id} />
        </div>
      )}

      <details className="mt-3 border-t border-border/50 pt-3 text-sm">
        <summary className="w-fit cursor-pointer rounded-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary">{translateI18n("milestoneCompact.scheduleDetails")}</summary>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
          <div><dt className="text-muted-foreground">{translateI18n("copy.startLabel")}</dt><dd className="font-medium text-foreground">{formatDate(effectiveDeadline.start_date)}</dd></div>
          <div><dt className="text-muted-foreground">{translateI18n("copy.durationLabel")}</dt><dd className="font-medium text-foreground">{effectiveDeadline.duration_working_days ?? "-"} {translateI18n("milestoneCompact.workingDays")}</dd></div>
          <div><dt className="text-muted-foreground">{translateI18n("copy.dueLabel")}</dt><dd className="font-medium text-foreground">{formatDate(effectiveDeadline.due_date)}</dd></div>
        </dl>
        {deadlineApproval?.deadline && <div className="mt-3 border-t border-border/40 pt-3 text-xs">
          <p className="font-medium text-foreground">{translateI18n("milestoneCompact.deadlineChange")} <DeadlineBadge status={deadlineApproval.status} /></p>
          <p className="mt-1 text-muted-foreground">{formatDate(deadlineApproval.deadline.start_date)} · {deadlineApproval.deadline.duration_working_days ?? "-"} {translateI18n("milestoneCompact.workingDays")} · {formatDate(deadlineApproval.deadline.due_date)}</p>
          {deadlineApproval.deadline.change_reason && <p className="mt-1 text-muted-foreground">{deadlineApproval.deadline.change_reason}</p>}
          {deadlineApproval.review_note && <p className="mt-1 text-muted-foreground">{deadlineApproval.review_note}</p>}
          {deadlineApproval.reviewed_by?.full_name && <p className="mt-1 text-muted-foreground">{translateI18n("copy.reviewedBy")} {deadlineApproval.reviewed_by.full_name}</p>}
        </div>}
      </details>

      {(canReadContributions || canCreateContribution || canPromoteContributions) && <div className="mt-3 border-t border-border/50 pt-3">
        <MilestoneContributionsPanel milestoneId={milestone.id} milestoneName={milestone.name} projectId={project.id}
          canRead={canReadContributions} canCreate={canCreateContribution} canPromote={canPromoteContributions} />
      </div>}

      {/* ─── Informative Waiting State Alerts ─── */}
      {isAssignPic && milestoneStatus === "IN_PROGRESS" && (
        <div className="mt-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-primary flex items-center gap-2">
          <Users className="h-4 w-4 shrink-0 text-primary" />
          <span>{translateI18n("copy.waitingAssignment")}</span>
        </div>
      )}

      </div>}

      {error && !finalOutcomeOpen && <p role="alert" className="px-4 pb-3 text-xs text-destructive">{translateStoredError(error)}</p>}
      {message && <p role="status" className="px-4 pb-3 text-xs text-success">{message === "projectDetail.documentsUploaded" ? translateI18n("projectDetail.documentsUploaded", { count: uploadedDocumentCount }) : translateStoredMessage(message)}</p>}

      {/* Dialogs */}
      <BusinessConfirmation open={completionConfirming} onOpenChange={setCompletionConfirming}
        title={`${project.name} - ${milestone.name}`} changes={[`${formatMilestoneStatusLabel(milestone.status)} -> ${formatMilestoneStatusLabel("COMPLETED")}`]}
        action={translateI18n("projectDetail.stageCompleted")} onConfirm={async () => {
          await complete.mutateAsync(); setMessage("projectDetail.stageCompleted");
        }} />
      {finalOutcomeDialog}
      <DeadlineDialog open={deadlineOpen} onOpenChange={setDeadlineOpen} projectId={project.id} milestone={milestone} />
      <SalesMilestoneDocumentUploadDialog
        open={salesDocumentUploadOpen}
        onOpenChange={setSalesDocumentUploadOpen}
        projectId={project.id}
        milestoneId={milestone.id}
        milestoneName={milestone.name}
        onSuccess={(uploadedCount) => {
          setError("");
          setUploadedDocumentCount(uploadedCount);
          setMessage("projectDetail.documentsUploaded");
        }}
      />
      <DeadlineReviewDialog
        open={Boolean(review) && review?.type === "DEADLINE"}
        onOpenChange={(open) => !open && setReview(null)}
        projectId={project.id}
        milestoneId={milestone.id}
        approvalId={deadlineApproval?.id}
        type="DEADLINE"
        decision={review?.decision || "APPROVE"}
        projectName={project.name}
        milestoneName={milestone.name}
        currentDeadline={effectiveDeadline}
        requestedDeadline={deadlineApproval?.deadline}
        requestedBy={deadlineApproval?.requested_by?.full_name}
        requestedAt={deadlineApproval?.requested_at}
      />
    </div>
  );
}

function DeadlineBadge({ status }: { status: DeadlineApprovalStatus }) {
  if (status === "APPROVED") return <Badge variant="success">{translateI18n("milestoneStatus.APPROVED")}</Badge>;
  if (status === "REJECTED") return <Badge variant="destructive">{translateI18n("approvalStatus.REJECTED")}</Badge>;
  if (status === "SUPERSEDED") return <Badge variant="outline">{translateI18n("documentStatus.SUPERSEDED")}</Badge>;
  return <Badge variant="warning">{translateI18n("copy.pendingReview")}</Badge>;
}
