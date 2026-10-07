"use client";
import { BusinessConfirmation } from "./business-confirmation";

import { prepareReviewRequest, reviewRequestKey, validFileRevisionSelection, type FileRevisionInput } from "@/lib/output-file-revisions";
import { focusOutputReviewLink, outputReviewIsStale, outputReviewTarget } from "@/lib/approval-queue";
import { captureOutputReview, reviewTargetsAreCurrent, runConfirmedDecision } from "@/lib/phase-review";

import { translate as translateI18n, getIntlLocale, translateOutputStatus, translateProjectStatus, translateOutputName, translateStoredError, translateStoredMessage } from "@/i18n";
import { useLanguage } from "@/components/i18n/language-provider";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Download, History, Loader2, RotateCcw, Send } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  type OutputDocumentBatchResult,
  useOutputDocumentFileDownload,
  useOutputDocuments,
  useOutputDocumentVersions,
  useReviewOutputDocuments,
  useSubmitOutputDocuments,
  useUpdateOutputChecklist,
} from "@/hooks/use-output-documents";
import { authorizedFetch } from "@/lib/api-client";
import {
  getActiveOutputDocuments,
  getOutputDocumentApprovalSelectionLabel,
  getOutputDocumentApprovalSelection,
  getOutputDocumentApproveAction,
  getOutputDocumentContextMessage,
  getOutputDocumentSubmissionSelectionLabel,
  getOutputDocumentSubmitAction,
  getSubmittableOutputDocuments,
  getSingleSubmissionOperationState,
  getSingleReviewOperationState,
  getReviewableOutputDocuments,
  isBatchReviewOperation,
  isBatchSubmissionOperation,
  type ReviewOperation,
  type SubmissionOperation,
} from "@/lib/output-document-ux";
import { useRetryProjectCompletion } from "@/hooks/use-projects";
import type { Project, ProjectOutputDocumentItem } from "@/types/project";
import { OutputDocumentFiles, formatOutputFileSize } from "./output-document-files";
import { getOutputDraftSubmitRequest } from "@/lib/output-document-draft";
import { getOutputArchiveErrorKey } from "@/lib/output-archive-error";

interface OutputDocumentsSectionProps {
  project: Project;
  canEditScope?: boolean;
  milestoneId?: string;
  milestoneStatus?: string;
  milestoneStartDate?: string | null;
  milestonePicId?: string | null;
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleString(getIntlLocale(), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function OutputStatusBadge({ status }: { status: ProjectOutputDocumentItem["status"] }) {
  const className = status === "APPROVED"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
    : status === "REVISION_REQUIRED"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : status === "IN_REVIEW"
        ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
        : "border-border/60 bg-muted/30 text-muted-foreground";
  return <Badge variant="outline" className={`text-[11px] ${className}`}>{translateOutputStatus(status)}</Badge>;
}

function BatchResultNotice({ results, documents, action }: { results: OutputDocumentBatchResult[]; documents: ProjectOutputDocumentItem[]; action: "submit" | "approve" | "revise" }) {
  if (!results.length) return null;
  const failed = results.filter((result) => !result.success);
  const successful = results.filter((result) => result.success);
  const succeeded = results.length - failed.length;
  return (
    <div className={`rounded-md border p-3 text-xs ${failed.length ? "border-amber-500/30 bg-amber-500/10 text-amber-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
      <p className="font-semibold">{translateI18n(action === "submit" ? "outputUi.submitSummary" : action === "approve" ? "outputUi.approveSummary" : "outputUi.reviseSummary", { success: succeeded, failed: failed.length })}</p>
      {successful.map((result) => { const item = documents.find((document) => document.key === result.documentKey); return <p key={result.documentKey} className="mt-1">{translateI18n("outputUi.itemSuccess", { name: item ? translateOutputName(item.key, item.name) : translateI18n("documents.output") })}</p>; })}
      {failed.length > 0 && <p className="mt-1">{translateI18n("copy.retryFailed")}</p>}
      {failed.map((result) => { const item = documents.find((document) => document.key === result.documentKey); return <p key={result.documentKey} className="mt-1">{item ? translateOutputName(item.key, item.name) : translateI18n("documents.output")}: {translateStoredError(result.message || "outputUi.actionFailed")}</p>; })}
    </div>
  );
}

function OutputDocumentRow({ projectId, document, canUpload, canReview, canReadHistory, hasAssignedPic, role, submissionSelectionMode, submissionOperation, approvalSelectionMode, reviewOperation, reviewPending, draftBusy, submitChecked, approveChecked, onDraftBusyChange, refreshDraft, onSubmit, onApprove, onToggleSubmit, onToggleApprove, onRevision, onHistory }: {
  projectId: string;
  document: ProjectOutputDocumentItem;
  canUpload: boolean;
  canReview: boolean;
  canReadHistory: boolean;
  hasAssignedPic: boolean;
  role?: string;
  submissionSelectionMode: boolean;
  submissionOperation: SubmissionOperation;
  approvalSelectionMode: boolean;
  reviewOperation: ReviewOperation;
  reviewPending: boolean;
  draftBusy: boolean;
  submitChecked: boolean;
  approveChecked: boolean;
  onDraftBusyChange: (documentKey: string, busy: boolean) => void;
  refreshDraft: (documentKey: string) => Promise<ProjectOutputDocumentItem>;
  onSubmit: () => void;
  onApprove: () => void;
  onToggleSubmit: () => void;
  onToggleApprove: () => void;
  onRevision: () => void;
  onHistory: () => void;
}) {
  const [feedbackExpanded, setFeedbackExpanded] = useState(false);
  const [reviewLink, setReviewLink] = useState<ReturnType<typeof outputReviewTarget>>(null);
  useEffect(() => {
    const locate = () => {
      const target = outputReviewTarget(window.location.hash);
      setReviewLink(target);
      if (target?.outputId === document.id) {
        window.requestAnimationFrame(() => {
          focusOutputReviewLink(window.location.hash, document.milestoneId, window.document);
        });
      }
    };
    locate();
    window.addEventListener("hashchange", locate);
    return () => window.removeEventListener("hashchange", locate);
  }, [document.id, document.currentVersionId, document.status]);
  const uploadable = canUpload && ["TO_DO", "DRAFT", "REVISION_REQUIRED"].includes(document.status);
  const submitAction = getOutputDocumentSubmitAction({ ...document, role, canUpload });
  const submittable = Boolean(submitAction);
  const approveAction = getOutputDocumentApproveAction({ ...document, canReview });
  const reviewable = Boolean(approveAction);
  const submissionState = getSingleSubmissionOperationState(submissionOperation, document.key);
  const reviewState = getSingleReviewOperationState(reviewOperation, document.key);
  const contextMessage = getOutputDocumentContextMessage({ role, status: document.status, canUpload: uploadable, canReview: reviewable, hasAssignedPic });

  return (
    <div id={`project-output-${document.id}`} tabIndex={-1} className="min-w-0 space-y-2 py-3 first:pt-0 last:pb-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      {outputReviewIsStale(reviewLink, document) && <p role="status" className="text-xs text-amber-400">{translateI18n("outputQueue.noLongerPending")}</p>}
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {submittable && submissionSelectionMode && <input type="checkbox" disabled={draftBusy || submissionOperation !== null} checked={submitChecked} onChange={onToggleSubmit} aria-label={getOutputDocumentSubmissionSelectionLabel(translateOutputName(document.key, document.name))} className="h-4 w-4 accent-primary" />}
            {reviewable && approvalSelectionMode && <input type="checkbox" checked={approveChecked} onChange={onToggleApprove} aria-label={getOutputDocumentApprovalSelectionLabel(translateOutputName(document.key, document.name))} className="h-4 w-4 accent-primary" />}
            <p className="min-w-0 break-words text-sm font-medium text-foreground">{translateOutputName(document.key, document.name)}</p>
            <OutputStatusBadge status={document.status} />
          </div>
          {document.reviewFeedback && <div className="flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-words"><strong>{translateI18n("copy.inputLabel")}</strong> {feedbackExpanded || document.reviewFeedback.length <= 180 ? document.reviewFeedback : `${document.reviewFeedback.slice(0, 180)}?`}
              {document.reviewFeedback.length > 180 && <button type="button" className="ml-1 rounded-sm font-medium underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-primary" onClick={() => setFeedbackExpanded((current) => !current)}>{translateI18n(feedbackExpanded ? "outputUi.readLess" : "outputUi.readMore")}</button>}
            </span>
          </div>}
          {contextMessage && !uploadable && <p className="text-xs text-muted-foreground">{contextMessage}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:max-w-[45%] sm:justify-end">
          {submittable && (
            <Button
              type="button"
              size="sm"
              className="gap-1.5 font-medium shadow-sm"
              aria-busy={submissionState.ariaBusy || undefined}
              disabled={draftBusy || submissionState.isDisabled}
              onClick={onSubmit}
            >
              {submissionState.isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {submissionState.isLoading ? translateI18n("outputUi.submitting") : submitAction}
            </Button>
          )}
          {canReadHistory && Boolean(document.versionCount || document.legacyVersionCount) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={onHistory}
            >
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{translateI18n("outputUi.historyCount", { count: document.versionCount || document.legacyVersionCount || 0 })}</span>
            </Button>
          )}
          {reviewable && !approvalSelectionMode && (
            <Button
              type="button"
              size="sm"
              className="gap-1.5 bg-emerald-600 font-medium text-white shadow-sm hover:bg-emerald-700"
              aria-busy={reviewState.ariaBusy || undefined}
              disabled={reviewPending || reviewState.isDisabled}
              onClick={onApprove}
            >
              {reviewState.isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {reviewState.isLoading ? translateI18n("outputUi.approving") : approveAction}
            </Button>
          )}
          {reviewable && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 border-destructive/40 font-medium text-destructive hover:bg-destructive/10"
              disabled={reviewPending || reviewOperation !== null}
              onClick={onRevision}
            >
              {translateI18n("copy.requestRevision")}
            </Button>
          )}
        </div>
      </div>
      <OutputDocumentFiles projectId={projectId} document={document} editable={uploadable} blocked={submissionOperation !== null || reviewPending} onBusyChange={onDraftBusyChange} refreshDraft={refreshDraft} />
      {uploadable && <p className="text-xs text-muted-foreground">{translateI18n("outputFiles.draftHelp")}</p>}
    </div>
  );
}

function VersionHistoryDialog({ projectId, document, onClose }: { projectId: string; document: ProjectOutputDocumentItem; onClose: () => void }) {
  const versions = useOutputDocumentVersions(projectId, document.key);
  const download = useOutputDocumentFileDownload(projectId, document.key);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const downloadVersion = async (versionId: string, fileId: string) => {
    setError(null);
    setDownloadingId(fileId);
    try {
      const result = await download.mutateAsync({ versionId, fileId });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch {
      setError("outputUi.versionOpenFailed");
    } finally { setDownloadingId(null); }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogHeader><DialogTitle>{translateI18n("copy.versionHistory")}</DialogTitle><DialogDescription>{translateI18n("outputUi.oldFiles", { name: translateOutputName(document.key, document.name) })}</DialogDescription></DialogHeader>
      <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
        {versions.isLoading && <p className="py-6 text-center text-sm text-muted-foreground">{translateI18n("copy.loadingHistory")}</p>}
        {versions.isError && <div className="flex items-center justify-between gap-2 py-3 text-sm text-destructive"><p>{translateI18n("copy.versionHistoryError")}</p><Button type="button" size="sm" variant="outline" onClick={() => void versions.refetch()}>{translateI18n("outputUi.retryLoad")}</Button></div>}
        {!versions.isLoading && !versions.isError && !versions.data?.versions.length && <p className="py-3 text-sm text-muted-foreground">{translateI18n("outputFiles.historyEmpty")}</p>}
        {versions.data?.versions.map((version) => (
          <div key={version.id} className="rounded-md border border-border/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0"><p className="text-sm font-medium">v{version.versionNumber}</p><p className="text-xs text-muted-foreground">{translateI18n(version.submittedAt ? "outputFiles.submittedAt" : "outputUi.uploadedAt", { date: formatDate(version.submittedAt || version.uploadedAt) })}</p></div>
              <OutputStatusBadge status={version.status} />
            </div>
            {version.versionKind && version.versionKind !== "SUBMITTED" && <p className="mt-1 text-xs text-muted-foreground">{translateI18n(version.versionKind === "LEGACY_SUBMITTED" ? "outputFiles.legacySubmitted" : "outputFiles.legacyUnconfirmed")}</p>}
            {version.versionKind === "LEGACY_UPLOAD_UNCONFIRMED" && <p className="mt-1 text-xs text-muted-foreground">{translateI18n("outputFiles.legacyHelp")}</p>}
            <div className="mt-2 divide-y divide-border/40">{version.files?.map((file) => <div key={file.id} className="flex min-w-0 items-center justify-between gap-2 py-1.5"><div className="min-w-0"><p className="break-words text-xs">{file.fileName}</p><p className="text-xs text-muted-foreground">{formatOutputFileSize(file.fileSize)}</p>{version.fileRevisions?.filter(marker => marker.fileId === file.id).map(marker => <p key={marker.fileId} className="whitespace-pre-wrap break-words text-xs text-destructive">{marker.feedback}</p>)}</div><Button type="button" size="sm" variant="ghost" disabled={downloadingId !== null} onClick={() => void downloadVersion(version.id, file.id)} aria-label={translateI18n("outputFiles.downloadFile", { name: file.fileName })}>{downloadingId === file.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}{translateI18n("common.download")}</Button></div>)}</div>
            {version.submissionNote && <p className="mt-2 text-xs text-muted-foreground"><strong>{translateI18n("ui.submitNote")}</strong> {version.submissionNote}</p>}
            {version.reviewFeedback && <p className="mt-2 text-xs text-destructive"><strong>{translateI18n("copy.reviewFeedback")}</strong> {version.reviewFeedback}</p>}
          </div>
        ))}
        {error && <p className="text-xs text-destructive">{translateStoredError(error)}</p>}
      </div>
      <DialogFooter><Button type="button" variant="outline" onClick={onClose}>{translateI18n("common.close")}</Button></DialogFooter>
    </Dialog>
  );
}

export function OutputDocumentsSection({ project, milestoneId, milestoneStatus, milestoneStartDate, milestonePicId }: OutputDocumentsSectionProps) {
  const { user } = useAuth();
  const outputQuery = useOutputDocuments(project.id);
  const submit = useSubmitOutputDocuments(project.id);
  const review = useReviewOutputDocuments(project.id);
  const updateChecklist = useUpdateOutputChecklist(project.id);
  const checklistStale = (updateChecklist.error as { status?: number } | null)?.status === 409;
  const retryCompletion = useRetryProjectCompletion(project.id);
  const [submitConfirmation, setSubmitConfirmation] = useState<{ keys: string[]; operation: Exclude<SubmissionOperation,null>; items: Array<{ document_key: string; expected_draft_revision: number; request_id: string }> } | null>(null);
  const [checklistConfirming, setChecklistConfirming] = useState(false);
  const checklistBusy = useRef(false);
  const [submitSelection, setSubmitSelection] = useState<string[]>([]);
  const [submissionSelectionMode, setSubmissionSelectionMode] = useState(false);
  const [submissionOperation, setSubmissionOperation] = useState<SubmissionOperation>(null);
  const [approveSelection, setApproveSelection] = useState<string[]>([]);
  const [approvalSelectionMode, setApprovalSelectionMode] = useState(false);
  const [reviewOperation, setReviewOperation] = useState<ReviewOperation>(null);
  const [batchResults, setBatchResults] = useState<OutputDocumentBatchResult[]>([]);
  const [batchAction, setBatchAction] = useState<"submit" | "approve" | "revise">("submit");
  const [approvalConfirmation, setApprovalConfirmation] = useState<{ targets: ReturnType<typeof captureOutputReview>; operation: Exclude<ReviewOperation, null> } | null>(null);
  const [confirmationError, setConfirmationError] = useState(false);
  const [revisionConfirmed, setRevisionConfirmed] = useState(false);
  const [revisionError, setRevisionError] = useState(false);
  const [revisionTarget, setRevisionTarget] = useState<ProjectOutputDocumentItem | null>(null);
  const [revisionFeedback, setRevisionFeedback] = useState("");
  const [fileRevisionInputs, setFileRevisionInputs] = useState<FileRevisionInput[]>([]);
  const reviewRequests = useRef(new Map<string, string>());
  const reviewInFlight = useRef(false);
  const [historyDocument, setHistoryDocument] = useState<ProjectOutputDocumentItem | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistSelection, setChecklistSelection] = useState<string[]>([]);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [completionRetryMessage, setCompletionRetryMessage] = useState<string | null>(null);
  const [draftBusyKeys, setDraftBusyKeys] = useState<string[]>([]);
  const draftBusyRef = useRef(new Set<string>());
  const submitRequests = useRef(new Map<string, { revision: number; requestId: string }>());
  const submissionInFlight = useRef(false);
  const onDraftBusyChange = useCallback((documentKey: string, busy: boolean) => {
    if (busy) draftBusyRef.current.add(documentKey); else draftBusyRef.current.delete(documentKey);
    setDraftBusyKeys(Array.from(draftBusyRef.current));
  }, []);
  const refreshDraft = useCallback(async (documentKey: string) => {
    const result = await outputQuery.refetch();
    const current = result.data?.documents.find((item) => item.key === documentKey);
    if (!result.isSuccess || !current) throw new Error("Draft refresh failed");
    return current;
  }, [outputQuery.refetch]);

  const documents = outputQuery.data?.documents || [];
  const activeDocuments = useMemo(
    () => getActiveOutputDocuments(documents).filter((document) => !milestoneId || document.milestoneId === milestoneId),
    [documents, milestoneId]
  );
  const isHeadSa = user?.role === "HEAD_SA";
  const isAssignedPic = (user?.role === "SA" || user?.role === "HEAD_SA") && project.pic?.id === user?.id;
  const isBeforeStart = Boolean(milestoneStartDate && milestoneStartDate.slice(0, 10) > new Date().toISOString().slice(0, 10));
  const canUpload = Boolean(isAssignedPic && project.status === "ACTIVE" && !project.is_postponed
    && (!milestoneId || (milestoneStatus === "IN_PROGRESS" && milestonePicId === user?.id)) && !isBeforeStart);
  const canReadHistory = Boolean(isHeadSa || isAssignedPic);
  const isSalesOwner = user?.role === "SALES" && project.sales_id === user.id;
  const isScopeLocked = outputQuery.data?.isScopeLocked ?? project.status !== "DRAFT";
  const approvedCount = activeDocuments.filter((document) => document.status === "APPROVED").length;
  const submittableDocuments = useMemo(
    () => getSubmittableOutputDocuments(activeDocuments, canUpload, user?.role),
    [activeDocuments, canUpload, user?.role]
  );
  const reviewableDocuments = useMemo(
    () => getReviewableOutputDocuments(activeDocuments, isHeadSa),
    [activeDocuments, isHeadSa]
  );

  const { locale } = useLanguage();
  const groups = useMemo(() => ([
    { key: "PRA_TENDER" as const, title: "Pra-Tender", documents: activeDocuments.filter((document) => document.group === "PRA_TENDER") },
    { key: "ON_SUBMISSION_TENDER" as const, title: "On Submission Tender", documents: activeDocuments.filter((document) => document.group === "ON_SUBMISSION_TENDER") },
  ]).filter((group) => group.documents.length > 0), [activeDocuments, locale]);
  const canSeeFullScope = isHeadSa || isAssignedPic;
  const summaryParts = canSeeFullScope
    ? [translateI18n("outputUi.outputCount", { count: activeDocuments.length }),
      approvedCount > 0 && translateI18n("outputUi.approvedCount", { count: approvedCount }),
      activeDocuments.some((item) => item.status === "IN_REVIEW") && translateI18n("milestoneCompact.awaitingReview", { count: activeDocuments.filter((item) => item.status === "IN_REVIEW").length }),
      activeDocuments.some((item) => item.status === "REVISION_REQUIRED") && translateI18n("milestoneCompact.needsRevision", { count: activeDocuments.filter((item) => item.status === "REVISION_REQUIRED").length })]
    : [approvedCount > 0 ? translateI18n("outputUi.approvedCount", { count: approvedCount }) : translateI18n("outputUi.noApprovedYet")];

  const submissionItems = (keys: string[]) => {
    const submittableKeys = new Set(submittableDocuments.map((document) => document.key));
    if (keys.some((key) => !submittableKeys.has(key) || draftBusyRef.current.has(key))) {
      throw new Error(translateI18n("outputUi.draftsUnavailable"));
    }
    return keys.map((key) => {
      const document = activeDocuments.find((item) => item.key === key)!;
      return getOutputDraftSubmitRequest(key, document.draftRevision!, submitRequests.current, () => crypto.randomUUID());
    });
  };

  const openSubmission = (keys: string[], operation: Exclude<SubmissionOperation,null>) => {
    try { setSubmitConfirmation({ keys, operation, items: submissionItems(keys) }); }
    catch { setBatchResults(keys.map(documentKey => ({ documentKey, success: false, message: "outputUi.draftsUnavailable" }))); }
  };

  const submitDocuments = async (keys: string[], operation: Exclude<SubmissionOperation, null>, items: NonNullable<typeof submitConfirmation>['items']) => {
    if (submissionInFlight.current || keys.some((key) => draftBusyRef.current.has(key))) return;
    submissionInFlight.current = true;
    setBatchAction("submit");
    setBatchResults([]);
    setSubmissionOperation(operation);
    let partialFailure = false;
    try {
      const response = await submit.mutateAsync({ items });
      setBatchResults(response.results);
      const failedKeys = response.results.filter((result) => !result.success).map((result) => result.documentKey);
      setSubmitSelection(failedKeys);
      setSubmissionSelectionMode(failedKeys.length > 0);
      partialFailure = failedKeys.length > 0;
      if (partialFailure) setSubmitConfirmation(current => current && ({ ...current, keys: failedKeys, items: current.items.filter(item => failedKeys.includes(item.document_key)) }));
    } catch (error) {
      setBatchResults(keys.map((documentKey) => ({ documentKey, success: false, message: "outputUi.submissionFailed" })));
      setSubmitSelection(keys);
      setSubmissionSelectionMode(true);
      throw error;
    } finally {
      submissionInFlight.current = false;
      setSubmissionOperation(null);
    }
    if (partialFailure) throw new Error("Some submissions were not saved.");
  };

  const submitSelected = async () => openSubmission(submitSelection, { kind: "batch" });

  const approveDocuments = async (keys: string[], operation: Exclude<ReviewOperation, null>, targets: ReturnType<typeof captureOutputReview>) => {
    if (reviewInFlight.current) return false;
    reviewInFlight.current = true;
    setBatchAction("approve");
    setBatchResults([]);
    setReviewOperation(operation);
    try {
      const response = await review.mutateAsync({ decision: "APPROVE", items: targets.map(({ document_key, expected_version_id }) => prepareReviewRequest({ document_key, expected_version_id, decision: "APPROVE" }, reviewRequests.current)) });
      setBatchResults(response.results);
      const failedKeys = response.results.filter((result) => !result.success).map((result) => result.documentKey);
      setApproveSelection(operation.kind === "batch" ? failedKeys : []);
      setApprovalSelectionMode(operation.kind === "batch" && failedKeys.length > 0);
      if (response.completionRetryRequired) {
        setCompletionRetryMessage("outputUi.completionRetry");
      }
      return response.results.length === targets.length && response.results.every(result => result.success);
    } catch (error) {
      setBatchResults(keys.map((documentKey) => ({ documentKey, success: false, message: "outputUi.approvalFailed" })));
      setApproveSelection(operation.kind === "batch" ? keys : []);
      setApprovalSelectionMode(operation.kind === "batch");
      return false;
    } finally {
      reviewInFlight.current = false;
      setReviewOperation(null);
    }
  };

  const openApproval = (keys: string[], operation: Exclude<ReviewOperation, null>) => {
    setConfirmationError(false);
    try { setApprovalConfirmation({ targets: captureOutputReview(keys.map(key => documents.find(item => item.key === key)!)), operation }); }
    catch { setConfirmationError(true); }
  };
  const approveSelected = () => openApproval(approveSelection, { kind: "batch" });
  const approvalCanRetry = () => Boolean(approvalConfirmation?.targets.every(target => reviewRequests.current.has(reviewRequestKey({ document_key: target.document_key, expected_version_id: target.expected_version_id, decision: "APPROVE" }))));
  const confirmApproval = async () => {
    if (!approvalConfirmation || review.isPending || reviewInFlight.current) return;
    setConfirmationError(false);
    if (!approvalCanRetry() && !reviewTargetsAreCurrent(approvalConfirmation.targets, documents)) {
      setConfirmationError(true); await outputQuery.refetch(); return;
    }
    const saved = await runConfirmedDecision({ confirmed: true, current: approvalCanRetry() || reviewTargetsAreCurrent(approvalConfirmation.targets, documents) }, () => approveDocuments(approvalConfirmation.targets.map(item => item.document_key), approvalConfirmation.operation, approvalConfirmation.targets));
    if (saved) setApprovalConfirmation(null);
    else { setConfirmationError(true); await outputQuery.refetch(); }
  };

  const requestRevision = async (event: FormEvent) => {
    event.preventDefault();
    if (!revisionTarget || review.isPending || reviewInFlight.current
      || !validFileRevisionSelection(revisionTarget.files || [], fileRevisionInputs)) return;
    setRevisionError(false);
    if (!revisionConfirmed) { setRevisionConfirmed(true); return; }
    if (!revisionTarget.currentVersionId) return;
    const input = { document_key: revisionTarget.key, expected_version_id: revisionTarget.currentVersionId,
      decision: "REVISE" as const, feedback: revisionFeedback.trim(), file_revisions: fileRevisionInputs };
    const retry = reviewRequests.current.has(reviewRequestKey(input));
    if (!retry && !reviewTargetsAreCurrent(captureOutputReview([revisionTarget]), documents)) {
      setRevisionError(true); await outputQuery.refetch(); return;
    }
    reviewInFlight.current = true;
    setBatchAction("revise");
    setBatchResults([]);
    try {
      const response = await review.mutateAsync({ decision: "REVISE", feedback: input.feedback,
        items: [prepareReviewRequest(input, reviewRequests.current)] });
      setBatchResults(response.results);
      if (response.results[0]?.success) {
        setRevisionTarget(null); setRevisionFeedback(""); setFileRevisionInputs([]);
      } else { setRevisionError(true); await outputQuery.refetch(); }
    } catch {
      setRevisionError(true);
      setBatchResults([{ documentKey: revisionTarget.key, success: false, message: "outputUi.revisionFailed" }]);
    } finally { reviewInFlight.current = false; }
  };

  const openChecklist = () => {
    setChecklistSelection(documents.filter((document) => document.isSelected && (!project.active_phase_id || document.group === outputQuery.data?.scenarioKey)).map((document) => document.key));
    updateChecklist.prepare?.();
    setChecklistConfirming(false); updateChecklist.reset();
    setChecklistOpen(true);
  };

  const saveChecklist = async () => {
    if (checklistBusy.current || checklistStale) return;
    if (!checklistConfirming) { setChecklistConfirming(true); return; }
    checklistBusy.current = true;
    try { await updateChecklist.mutateAsync(checklistSelection); setChecklistOpen(false); }
    finally { checklistBusy.current = false; }
  };

  const downloadAllApproved = async () => {
    setDownloadingAll(true);
    setDownloadError(null);
    try {
      const response = await authorizedFetch(`/projects/${project.id}/output-documents/download-all`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setDownloadError(getOutputArchiveErrorKey(body?.message));
        return;
      }
      const blobUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = `${project.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_approved_outputs.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      setDownloadError("outputUi.archiveUnavailable");
    } finally {
      setDownloadingAll(false);
    }
  };

  const retryProjectCompletion = async () => {
    setCompletionRetryMessage(null);
    try {
      const result = await retryCompletion.mutateAsync();
      setCompletionRetryMessage(result.retried
        ? translateI18n("outputUi.waitingResult")
        : translateI18n("outputUi.projectStatusNow", { status: translateProjectStatus(result.status) }));
    } catch (error) {
      setCompletionRetryMessage("outputUi.retryFailed");
    }
  };

  return (
    <section id={milestoneId ? `milestone-outputs-${milestoneId}` : "output-documents"} tabIndex={-1} className="min-w-0 scroll-mt-20 focus:outline-none focus:ring-2 focus:ring-primary/60">
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-foreground">{translateI18n("outputUi.title")}</h4>
            {!outputQuery.isLoading && !outputQuery.isError && <p className="mt-1 text-xs text-muted-foreground">{summaryParts.filter(Boolean).join(" · ")}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {isSalesOwner && !isScopeLocked && !milestoneId && <Button type="button" size="sm" variant="outline" onClick={openChecklist}>{translateI18n("copy.optionalOutputs")}</Button>}
            {canUpload && submittableDocuments.length >= 2 && !submissionSelectionMode && <Button type="button" size="sm" variant="outline" onClick={() => setSubmissionSelectionMode(true)}>{translateI18n("copy.selectMultiple")}</Button>}
            {isHeadSa && reviewableDocuments.length >= 2 && !approvalSelectionMode && <Button type="button" size="sm" variant="outline" onClick={() => { setApproveSelection(getOutputDocumentApprovalSelection(reviewableDocuments, false)); setApprovalSelectionMode(true); }}>{translateI18n("copy.selectMultiple")}</Button>}
            {approvedCount > 0 && !milestoneId && <Button type="button" size="sm" variant="outline" disabled={downloadingAll} onClick={() => void downloadAllApproved()}>{downloadingAll ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}{translateI18n("outputUi.downloadAllApproved", { count: approvedCount })}</Button>}
            {outputQuery.data?.canRetryCompletion && !milestoneId && <Button type="button" size="sm" disabled={retryCompletion.isPending} onClick={() => void retryProjectCompletion()}>{retryCompletion.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}{translateI18n("outputUi.retryCompletion")}</Button>}
          </div>
        </div>
        {submissionSelectionMode && canUpload && <div className="flex flex-col gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm">{translateI18n("outputUi.draftsSelected", { count: submitSelection.length })}</p><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={submissionOperation !== null} onClick={() => setSubmitSelection(submittableDocuments.map((document) => document.key))}>{translateI18n("outputUi.selectAllDrafts")}</Button><Button type="button" size="sm" variant="outline" disabled={submissionOperation !== null || submitSelection.length === 0} onClick={() => setSubmitSelection([])}>{translateI18n("outputUi.clearSelection")}</Button><Button type="button" size="sm" variant="outline" disabled={submissionOperation !== null} onClick={() => { setSubmitSelection([]); setSubmissionSelectionMode(false); }}>{translateI18n("copy.cancelSelection")}</Button><Button type="button" size="sm" aria-busy={isBatchSubmissionOperation(submissionOperation) || undefined} disabled={submissionOperation !== null || submitSelection.length === 0 || submitSelection.some((key) => draftBusyKeys.includes(key))} onClick={() => void submitSelected()}>{isBatchSubmissionOperation(submissionOperation) ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}{isBatchSubmissionOperation(submissionOperation) ? translateI18n("outputUi.submittingSelected") : translateI18n("outputUi.submitSelected", { count: submitSelection.length })}</Button></div></div>}
        {approvalSelectionMode && isHeadSa && <div className="flex flex-col gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm">{translateI18n("outputUi.documentsSelected", { count: approveSelection.length })}</p><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={review.isPending || reviewOperation !== null} onClick={() => setApproveSelection(getOutputDocumentApprovalSelection(reviewableDocuments, true))}>{translateI18n("outputUi.selectAllReviewed")}</Button><Button type="button" size="sm" variant="outline" disabled={review.isPending || reviewOperation !== null || approveSelection.length === 0} onClick={() => setApproveSelection(getOutputDocumentApprovalSelection(reviewableDocuments, false))}>{translateI18n("outputUi.clearSelection")}</Button><Button type="button" size="sm" variant="outline" disabled={review.isPending || reviewOperation !== null} onClick={() => { setApproveSelection(getOutputDocumentApprovalSelection(reviewableDocuments, false)); setApprovalSelectionMode(false); }}>{translateI18n("copy.cancelSelection")}</Button>{approveSelection.length > 0 && <Button type="button" size="sm" aria-busy={isBatchReviewOperation(reviewOperation) || undefined} disabled={review.isPending || reviewOperation !== null} onClick={() => void approveSelected()}>{isBatchReviewOperation(reviewOperation) ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}{isBatchReviewOperation(reviewOperation) ? translateI18n("outputUi.approving") : translateI18n("outputUi.approveSelected", { count: approveSelection.length })}</Button>}</div></div>}
        <BatchResultNotice results={batchResults} documents={documents} action={batchAction} />
        {completionRetryMessage && <p className="text-xs text-muted-foreground">{translateStoredMessage(completionRetryMessage)}</p>}
        {downloadError && <p className="text-xs text-destructive">{translateStoredError(downloadError)}</p>}
        {milestoneId && isBeforeStart && <p className="text-xs text-muted-foreground">{translateI18n("outputUi.opensOn", { date: milestoneStartDate?.slice(0, 10) || "" })}</p>}
      </div>

      <div className="min-w-0 mt-3 space-y-3">
        {outputQuery.isLoading && <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {translateI18n("copy.loadingOutputs")}</div>}
        {outputQuery.isError && <div className="flex flex-wrap items-center gap-2 py-3 text-sm text-destructive"><AlertCircle className="h-4 w-4" /> {translateI18n("copy.outputLoadError")} <Button type="button" size="sm" variant="outline" onClick={() => void outputQuery.refetch()}>{translateI18n("outputUi.retryLoad")}</Button></div>}
        {!outputQuery.isLoading && !outputQuery.isError && activeDocuments.length === 0 && <p className="py-3 text-sm text-muted-foreground">{canSeeFullScope ? translateI18n("copy.noOutputSelected") : translateI18n("outputUi.noApprovedYet")}</p>}
        {groups.map((group) => (
          <div key={group.key} className="min-w-0">
            {groups.length > 1 && <h5 className="border-b border-border/50 py-1 text-xs font-medium text-muted-foreground">{group.title}</h5>}
            <div className="min-w-0 divide-y divide-border/50">
              {group.documents.map((document) => <OutputDocumentRow key={document.key} projectId={project.id} document={document} canUpload={canUpload} canReview={isHeadSa} canReadHistory={canReadHistory} hasAssignedPic={Boolean(project.pic?.id)} role={user?.role} submissionSelectionMode={submissionSelectionMode} submissionOperation={submissionOperation} approvalSelectionMode={approvalSelectionMode} reviewOperation={reviewOperation} reviewPending={review.isPending} draftBusy={draftBusyKeys.includes(document.key)} onDraftBusyChange={onDraftBusyChange} refreshDraft={refreshDraft} submitChecked={submitSelection.includes(document.key)} approveChecked={approveSelection.includes(document.key)} onSubmit={() => openSubmission([document.key], { kind: "single", documentKey: document.key })} onApprove={() => openApproval([document.key], { kind: "single", documentKey: document.key })} onToggleSubmit={() => setSubmitSelection((current) => current.includes(document.key) ? current.filter((key) => key !== document.key) : [...current, document.key])} onToggleApprove={() => setApproveSelection((current) => current.includes(document.key) ? current.filter((key) => key !== document.key) : [...current, document.key])} onRevision={() => { setRevisionTarget(document); setRevisionFeedback(""); setFileRevisionInputs(document.files?.length === 1 ? [{ file_id: document.files[0].id, feedback: "" }] : []); setRevisionConfirmed(false); setRevisionError(false); }} onHistory={() => setHistoryDocument(document)} />)}
            </div>
          </div>
        ))}
      </div>

      <BusinessConfirmation open={submitConfirmation !== null} onOpenChange={open => !open && setSubmitConfirmation(null)}
        title={project.name} changes={[translateI18n("businessAudit.submitHelp"), ...(submitConfirmation?.keys || []).map(key => { const output = documents.find(item => item.key === key); return `${translateOutputName(key,output?.name || key)} - ${translateI18n("businessAudit.fileCount",{ count: output?.draftFiles?.length || 0 })}`; })]}
        action={translateI18n("businessAudit.submit")} onConfirm={() => submitDocuments(submitConfirmation!.keys,submitConfirmation!.operation,submitConfirmation!.items)} />
      {approvalConfirmation && <Dialog open onOpenChange={value => !value && !review.isPending && setApprovalConfirmation(null)}>
        <DialogHeader><DialogTitle>{translateI18n("reviewConfirm.approve")}</DialogTitle><DialogDescription>{project.name}. {translateI18n("reviewConfirm.whole")}</DialogDescription></DialogHeader>
        <div className="max-h-[50vh] space-y-3 overflow-y-auto">{approvalConfirmation.targets.map(target => <div key={target.document_key} className="text-sm">
          <p className="font-medium">{translateOutputName(target.document_key, target.name)} · {target.group === 'PRA_TENDER' ? 'Pra-Tender' : 'On Submission Tender'}</p>
          <p>{translateI18n("reviewConfirm.snapshot", { version: target.version || translateI18n("common.notAvailable"), count: target.fileCount })}</p>
        </div>)}</div>
        {confirmationError && <p role="alert" className="text-sm text-destructive">{translateI18n(reviewTargetsAreCurrent(approvalConfirmation.targets, documents) ? "reviewConfirm.failed" : "reviewConfirm.stale")}</p>}
        <DialogFooter><Button variant="outline" disabled={review.isPending} onClick={() => setApprovalConfirmation(null)}>{translateI18n("common.cancel")}</Button>
          <Button disabled={review.isPending || (!approvalCanRetry() && !reviewTargetsAreCurrent(approvalConfirmation.targets, documents))} onClick={() => void confirmApproval()}>{translateI18n(review.isPending ? "common.saving" : "reviewConfirm.approve")}</Button></DialogFooter>
      </Dialog>}
      {revisionTarget && <Dialog open onOpenChange={open => !open && !review.isPending && setRevisionTarget(null)}>
        <DialogHeader><DialogTitle>{translateI18n("copy.requestRevision")}</DialogTitle><DialogDescription>{translateOutputName(revisionTarget.key, revisionTarget.name)}</DialogDescription></DialogHeader>
        <form onSubmit={requestRevision} className="space-y-3">
          <p className="text-sm">{project.name} · {revisionTarget.group === "PRA_TENDER" ? "Pra-Tender" : "On Submission Tender"}</p>
          <p className="text-sm">{translateI18n("reviewConfirm.snapshot", { version: revisionTarget.currentVersionNumber || translateI18n("common.notAvailable"), count: revisionTarget.files?.length || 0 })}</p>
          <p className="text-xs text-muted-foreground">{translateI18n("fileRevision.help")}</p>
          <div className="max-h-[40vh] divide-y divide-border overflow-y-auto">
            {revisionTarget.files?.map(file => {
              const marker = fileRevisionInputs.find(item => item.file_id === file.id);
              return <div key={file.id} className="space-y-2 py-2">
                <label className="flex items-start gap-2 break-words text-sm"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={Boolean(marker)} disabled={review.isPending || revisionConfirmed}
                  onChange={event => { setRevisionConfirmed(false); setFileRevisionInputs(current => event.target.checked ? [...current, { file_id: file.id, feedback: "" }] : current.filter(item => item.file_id !== file.id)); }} />{file.fileName}</label>
                {marker && <div><label htmlFor={`file-reason-${file.id}`} className="text-xs">{translateI18n("fileRevision.reason", { name: file.fileName })}</label>
                  {revisionConfirmed ? <p className="whitespace-pre-wrap break-words text-sm">{marker.feedback.trim()}</p> : <textarea id={`file-reason-${file.id}`} required maxLength={2000} value={marker.feedback} disabled={review.isPending}
                    onChange={event => setFileRevisionInputs(current => current.map(item => item.file_id === file.id ? { ...item, feedback: event.target.value } : item))}
                    className="min-h-16 w-full rounded-md border border-input bg-background p-2 text-sm" />}</div>}
              </div>;
            })}
          </div>
          <label htmlFor="output-revision-feedback" className="block text-xs">{translateI18n("fileRevision.general")}</label>
          <textarea id="output-revision-feedback" maxLength={2000} value={revisionFeedback} disabled={review.isPending || revisionConfirmed} onChange={event => setRevisionFeedback(event.target.value)} className="min-h-16 w-full rounded-md border border-input bg-background p-2 text-sm" />
          {revisionConfirmed && <p className="text-sm">{translateI18n("fileRevision.confirm", { count: fileRevisionInputs.length })}</p>}
          {revisionError && <p role="alert" className="text-sm text-destructive">{translateI18n(reviewTargetsAreCurrent(captureOutputReview([revisionTarget]), documents) ? "reviewConfirm.failed" : "reviewConfirm.stale")}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={review.isPending} onClick={() => setRevisionTarget(null)}>{translateI18n("common.cancel")}</Button>
            {revisionConfirmed && <Button type="button" variant="outline" disabled={review.isPending} onClick={() => setRevisionConfirmed(false)}>{translateI18n("fileRevision.editSelection")}</Button>}
            <Button type="submit" variant="destructive" disabled={review.isPending || !validFileRevisionSelection(revisionTarget.files || [], fileRevisionInputs)}>{review.isPending ? translateI18n("outputUi.saving") : translateI18n(revisionConfirmed ? "reviewConfirm.revise" : "reviewConfirm.continue")}</Button>
          </DialogFooter>
        </form>
      </Dialog>}
      {historyDocument && <VersionHistoryDialog projectId={project.id} document={historyDocument} onClose={() => setHistoryDocument(null)} />}
      <Dialog open={checklistOpen} onOpenChange={(open) => !updateChecklist.isPending && setChecklistOpen(open)}><DialogHeader><DialogTitle>{translateI18n("copy.optionalOutputs")}</DialogTitle><DialogDescription>{translateI18n("copy.outputLockHelp")}</DialogDescription></DialogHeader><div className="max-h-[55vh] space-y-2 overflow-y-auto">{documents.filter(document => !project.active_phase_id || document.group === outputQuery.data?.scenarioKey).map((document) => <label key={document.key} className="flex items-center justify-between gap-3 rounded-md border border-border/50 p-3 text-sm"><span className="flex min-w-0 items-center gap-2"><input type="checkbox" disabled={document.isRequired || checklistConfirming || updateChecklist.isPending} checked={document.isRequired || checklistSelection.includes(document.key)} onChange={() => setChecklistSelection((current) => current.includes(document.key) ? current.filter((key) => key !== document.key) : [...current, document.key])} className="h-4 w-4 accent-primary" /><span>{translateOutputName(document.key, document.name)}</span></span><Badge variant="secondary" className="text-[10px]">{document.isRequired ? translateI18n("outputUi.required") : translateI18n("outputUi.optional")}</Badge></label>)}</div><p className="mt-3 text-sm">{checklistConfirming && <>{project.name}: {translateI18n("businessAudit.scope")}<span className="block">{documents.filter(item => item.isSelected).map(item => translateOutputName(item.key,item.name)).join(", ")} {" -> "} {documents.filter(item => item.isRequired || checklistSelection.includes(item.key)).map(item => translateOutputName(item.key,item.name)).join(", ")}</span></>}</p>{updateChecklist.isError && <p role="alert" className="text-sm text-destructive">{translateI18n(checklistStale ? "businessAudit.stale" : "businessAudit.failed")}</p>}<DialogFooter><Button type="button" variant="outline" disabled={updateChecklist.isPending} onClick={() => setChecklistOpen(false)}>{translateI18n("common.cancel")}</Button><Button type="button" disabled={updateChecklist.isPending || checklistStale} onClick={() => void saveChecklist().catch(() => {})}>{updateChecklist.isPending ? translateI18n("outputUi.saving") : translateI18n(checklistConfirming ? "businessAudit.save" : "reviewConfirm.continue")}</Button></DialogFooter></Dialog>
    </section>
  );
}
