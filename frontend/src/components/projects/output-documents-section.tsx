"use client";

import { translate as translateI18n, getIntlLocale, translateOutputStatus, translateProjectStatus, translateOutputName, translateStoredError, translateStoredMessage } from "@/i18n";
import { useLanguage } from "@/components/i18n/language-provider";

import { useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Download, History, Loader2, RotateCcw, Send, UploadCloud } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  type OutputDocumentBatchResult,
  useOutputDocumentDownloadUrl,
  useOutputDocuments,
  useOutputDocumentVersionDownloadUrl,
  useOutputDocumentVersions,
  useReviewOutputDocuments,
  useSubmitOutputDocuments,
  useUpdateOutputChecklist,
  useUploadOutputDocument,
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

interface OutputDocumentsSectionProps {
  project: Project;
  canEditScope?: boolean;
  milestoneId?: string;
  milestoneStatus?: string;
  milestoneStartDate?: string | null;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024;

function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "-";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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

function OutputDocumentRow({ projectId, document, canUpload, canReview, canReadHistory, hasAssignedPic, role, submissionSelectionMode, submissionOperation, approvalSelectionMode, reviewOperation, reviewPending, submitChecked, approveChecked, onSubmit, onApprove, onToggleSubmit, onToggleApprove, onRevision, onHistory }: {
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
  submitChecked: boolean;
  approveChecked: boolean;
  onSubmit: () => void;
  onApprove: () => void;
  onToggleSubmit: () => void;
  onToggleApprove: () => void;
  onRevision: () => void;
  onHistory: () => void;
}) {
  const upload = useUploadOutputDocument(projectId, document.key);
  const download = useOutputDocumentDownloadUrl(projectId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [feedbackExpanded, setFeedbackExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const uploadable = canUpload && ["TO_DO", "DRAFT", "REVISION_REQUIRED"].includes(document.status);
  const submitAction = getOutputDocumentSubmitAction({
    role,
    status: document.status,
    currentVersionId: document.currentVersionId,
    canUpload,
  });
  const submittable = Boolean(submitAction);
  const approveAction = getOutputDocumentApproveAction({
    status: document.status,
    currentVersionId: document.currentVersionId,
    canReview,
  });
  const reviewable = Boolean(approveAction);
  const submissionState = getSingleSubmissionOperationState(submissionOperation, document.key);
  const reviewState = getSingleReviewOperationState(reviewOperation, document.key);
  const contextMessage = getOutputDocumentContextMessage({
    role,
    status: document.status,
    canUpload: uploadable,
    canReview: reviewable,
    hasAssignedPic,
  });

  const uploadFile = async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      setError("outputUi.fileTooLarge");
      return;
    }
    setError(null);
    setUploadSuccess(false);
    try {
      await upload.mutateAsync(file);
      setUploadSuccess(true);
    } catch (uploadError) {
      setError("outputUi.uploadFailed");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (uploadable && !upload.isPending) void uploadFile(event.dataTransfer.files?.[0]);
  };

  const handleDownload = async () => {
    setError(null);
    try {
      const result = await download.mutateAsync(document.key);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch {
      setError("outputUi.openFailed");
    }
  };

  return (
    <div onDragOver={uploadable ? (event) => { event.preventDefault(); setDragging(true); } : undefined}
      onDragLeave={() => setDragging(false)} onDrop={uploadable ? handleDrop : undefined}
      className={`flex min-w-0 flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4 ${dragging ? "rounded-md bg-primary/10 ring-1 ring-primary" : ""}`}>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {submittable && submissionSelectionMode && <input type="checkbox" checked={submitChecked} onChange={onToggleSubmit} aria-label={getOutputDocumentSubmissionSelectionLabel(translateOutputName(document.key, document.name))} className="h-4 w-4 accent-primary" />}
          {reviewable && approvalSelectionMode && <input type="checkbox" checked={approveChecked} onChange={onToggleApprove} aria-label={getOutputDocumentApprovalSelectionLabel(translateOutputName(document.key, document.name))} className="h-4 w-4 accent-primary" />}
          <p className="min-w-0 break-words text-sm font-medium text-foreground">{translateOutputName(document.key, document.name)}</p>
          <OutputStatusBadge status={document.status} />
        </div>
        {document.fileName ? (
          <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="max-w-full truncate text-foreground" title={document.fileName}>{document.fileName}</span>
            {Boolean(document.versionCount) && <span>{translateI18n("outputUi.versionNumber", { count: document.versionCount || 0 })}</span>}
            <span>{formatFileSize(document.fileSize)}</span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{translateI18n(document.status === "NOT_REQUIRED" ? "outputUi.notSelected" : "outputUi.noFile")}</p>
        )}
        {document.reviewFeedback && (
          <div className="flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-words"><strong>{translateI18n("copy.inputLabel")}</strong> {feedbackExpanded || document.reviewFeedback.length <= 180 ? document.reviewFeedback : `${document.reviewFeedback.slice(0, 180)}…`}
              {document.reviewFeedback.length > 180 && <button type="button" className="ml-1 rounded-sm font-medium underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => setFeedbackExpanded((current) => !current)}>{translateI18n(feedbackExpanded ? "outputUi.readLess" : "outputUi.readMore")}</button>}
            </span>
          </div>
        )}
        {error && <p className="text-xs text-destructive">{translateStoredError(error)}</p>}
        {uploadSuccess && !error && <p role="status" className="text-xs text-emerald-400">{translateI18n("copy.uploadSuccess")}</p>}
        {uploadable && <p className="text-xs text-muted-foreground">{translateI18n(document.fileName ? "outputUi.dropReplacement" : "outputUi.dropFile")}</p>}
        {contextMessage && !uploadable && <p className="text-xs text-muted-foreground">{contextMessage}</p>}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:max-w-[45%] sm:justify-end">
        {uploadable && <><input ref={inputRef} type="file" className="sr-only" disabled={upload.isPending} onChange={(event) => void uploadFile(event.target.files?.[0])} />
          <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={upload.isPending} onClick={() => inputRef.current?.click()}>
            {upload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}{translateI18n(upload.isPending ? "outputUi.uploading" : document.fileName ? "outputUi.replace" : "outputUi.choose")}
          </Button></>}
        {submittable && <Button type="button" size="sm" className="gap-1.5" aria-busy={submissionState.ariaBusy || undefined} disabled={submissionState.isDisabled} onClick={onSubmit}>{submissionState.isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}{submissionState.isLoading ? translateI18n("outputUi.submitting") : submitAction}</Button>}
        {document.fileName && <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={download.isPending} onClick={() => void handleDownload()}><Download className="h-3.5 w-3.5" /> {translateI18n("common.download")}</Button>}
        {canReadHistory && Boolean(document.versionCount) && <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={onHistory}><History className="h-3.5 w-3.5" /> {translateI18n("outputUi.historyCount", { count: document.versionCount || 0 })}</Button>}
        {reviewable && !approvalSelectionMode && <Button type="button" size="sm" className="gap-1.5" aria-busy={reviewState.ariaBusy || undefined} disabled={reviewPending || reviewState.isDisabled} onClick={onApprove}>{reviewState.isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{reviewState.isLoading ? translateI18n("outputUi.approving") : approveAction}</Button>}
        {reviewable && <Button type="button" size="sm" variant="outline" className="border-destructive/30 text-destructive" disabled={reviewPending || reviewOperation !== null} onClick={onRevision}>{translateI18n("copy.requestRevision")}</Button>}
      </div>
    </div>
  );
}

function VersionHistoryDialog({ projectId, document, onClose }: { projectId: string; document: ProjectOutputDocumentItem; onClose: () => void }) {
  const versions = useOutputDocumentVersions(projectId, document.key);
  const download = useOutputDocumentVersionDownloadUrl(projectId, document.key);
  const [error, setError] = useState<string | null>(null);

  const downloadVersion = async (versionId: string) => {
    setError(null);
    try {
      const result = await download.mutateAsync(versionId);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch {
      setError("outputUi.versionOpenFailed");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogHeader><DialogTitle>{translateI18n("copy.versionHistory")}</DialogTitle><DialogDescription>{translateI18n("outputUi.oldFiles", { name: translateOutputName(document.key, document.name) })}</DialogDescription></DialogHeader>
      <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
        {versions.isLoading && <p className="py-6 text-center text-sm text-muted-foreground">{translateI18n("copy.loadingHistory")}</p>}
        {versions.isError && <p className="py-6 text-center text-sm text-destructive">{translateI18n("copy.versionHistoryError")}</p>}
        {versions.data?.versions.map((version) => (
          <div key={version.id} className="rounded-md border border-border/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0"><p className="truncate text-sm font-medium">v{version.versionNumber} - {version.fileName}</p><p className="text-xs text-muted-foreground">{translateI18n("outputUi.uploadedAt", { date: formatDate(version.uploadedAt) })} - {formatFileSize(version.fileSize)}</p></div>
              <div className="flex items-center gap-2"><OutputStatusBadge status={version.status} /><Button type="button" size="sm" variant="outline" disabled={download.isPending} onClick={() => void downloadVersion(version.id)}><Download className="mr-1.5 h-3.5 w-3.5" /> {translateI18n("common.download")}</Button></div>
            </div>
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

export function OutputDocumentsSection({ project, milestoneId, milestoneStatus, milestoneStartDate }: OutputDocumentsSectionProps) {
  const { user } = useAuth();
  const outputQuery = useOutputDocuments(project.id);
  const submit = useSubmitOutputDocuments(project.id);
  const review = useReviewOutputDocuments(project.id);
  const updateChecklist = useUpdateOutputChecklist(project.id);
  const retryCompletion = useRetryProjectCompletion(project.id);
  const [submitSelection, setSubmitSelection] = useState<string[]>([]);
  const [submissionSelectionMode, setSubmissionSelectionMode] = useState(false);
  const [submissionOperation, setSubmissionOperation] = useState<SubmissionOperation>(null);
  const [approveSelection, setApproveSelection] = useState<string[]>([]);
  const [approvalSelectionMode, setApprovalSelectionMode] = useState(false);
  const [reviewOperation, setReviewOperation] = useState<ReviewOperation>(null);
  const [batchResults, setBatchResults] = useState<OutputDocumentBatchResult[]>([]);
  const [batchAction, setBatchAction] = useState<"submit" | "approve" | "revise">("submit");
  const [revisionTarget, setRevisionTarget] = useState<ProjectOutputDocumentItem | null>(null);
  const [revisionFeedback, setRevisionFeedback] = useState("");
  const [historyDocument, setHistoryDocument] = useState<ProjectOutputDocumentItem | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistSelection, setChecklistSelection] = useState<string[]>([]);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [completionRetryMessage, setCompletionRetryMessage] = useState<string | null>(null);

  const documents = outputQuery.data?.documents || [];
  const activeDocuments = useMemo(
    () => getActiveOutputDocuments(documents).filter((document) => !milestoneId || document.milestoneId === milestoneId),
    [documents, milestoneId]
  );
  const isHeadSa = user?.role === "HEAD_SA";
  const isAssignedPic = (user?.role === "SA" || user?.role === "HEAD_SA") && project.pic?.id === user?.id;
  const isBeforeStart = Boolean(milestoneStartDate && milestoneStartDate.slice(0, 10) > new Date().toISOString().slice(0, 10));
  const canUpload = Boolean(isAssignedPic && project.status === "ACTIVE" && !project.is_postponed && (!milestoneId || milestoneStatus === "IN_PROGRESS") && !isBeforeStart);
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

  const batchItems = (keys: string[]) => keys.map((key) => {
    const document = documents.find((candidate) => candidate.key === key);
    if (!document?.currentVersionId) {
      throw new Error(translateI18n("outputUi.versionUnavailable"));
    }
    return { document_key: key, expected_version_id: document.currentVersionId };
  });

  const submissionItems = (keys: string[]) => {
    const submittableKeys = new Set(submittableDocuments.map((document) => document.key));
    if (keys.some((key) => !submittableKeys.has(key))) {
      throw new Error(translateI18n("outputUi.draftsUnavailable"));
    }
    return batchItems(keys);
  };

  const reviewItems = (keys: string[]) => {
    const reviewableKeys = new Set(reviewableDocuments.map((document) => document.key));
    if (keys.some((key) => !reviewableKeys.has(key))) {
      throw new Error(translateI18n("outputUi.reviewUnavailable"));
    }
    return batchItems(keys);
  };

  const submitDocuments = async (keys: string[], operation: Exclude<SubmissionOperation, null>) => {
    setBatchAction("submit");
    setBatchResults([]);
    setSubmissionOperation(operation);
    try {
      const response = await submit.mutateAsync({ items: submissionItems(keys) });
      setBatchResults(response.results);
      const failedKeys = response.results.filter((result) => !result.success).map((result) => result.documentKey);
      setSubmitSelection(failedKeys);
      setSubmissionSelectionMode(failedKeys.length > 0);
    } catch (error) {
      setBatchResults(keys.map((documentKey) => ({ documentKey, success: false, message: "outputUi.submissionFailed" })));
      setSubmitSelection(keys);
      setSubmissionSelectionMode(true);
    } finally {
      setSubmissionOperation(null);
    }
  };

  const submitSelected = async () => submitDocuments(submitSelection, { kind: "batch" });

  const approveDocuments = async (keys: string[], operation: Exclude<ReviewOperation, null>) => {
    setBatchAction("approve");
    setBatchResults([]);
    setReviewOperation(operation);
    try {
      const response = await review.mutateAsync({ decision: "APPROVE", items: reviewItems(keys) });
      setBatchResults(response.results);
      const failedKeys = response.results.filter((result) => !result.success).map((result) => result.documentKey);
      setApproveSelection(operation.kind === "batch" ? failedKeys : []);
      setApprovalSelectionMode(operation.kind === "batch" && failedKeys.length > 0);
      if (response.completionRetryRequired) {
        setCompletionRetryMessage("outputUi.completionRetry");
      }
    } catch (error) {
      setBatchResults(keys.map((documentKey) => ({ documentKey, success: false, message: "outputUi.approvalFailed" })));
      setApproveSelection(operation.kind === "batch" ? keys : []);
      setApprovalSelectionMode(operation.kind === "batch");
    } finally {
      setReviewOperation(null);
    }
  };

  const approveSelected = async () => approveDocuments(approveSelection, { kind: "batch" });

  const requestRevision = async (event: FormEvent) => {
    event.preventDefault();
    if (!revisionTarget || !revisionFeedback.trim()) return;
    setBatchAction("revise");
    setBatchResults([]);
    try {
      const response = await review.mutateAsync({ decision: "REVISE", feedback: revisionFeedback.trim(), items: batchItems([revisionTarget.key]) });
      setBatchResults(response.results);
      if (response.results[0]?.success) {
        setRevisionTarget(null);
        setRevisionFeedback("");
      }
    } catch (error) {
      setBatchResults([{ documentKey: revisionTarget.key, success: false, message: "outputUi.revisionFailed" }]);
    }
  };

  const openChecklist = () => {
    setChecklistSelection(documents.filter((document) => document.isSelected).map((document) => document.key));
    setChecklistOpen(true);
  };

  const saveChecklist = async () => {
    await updateChecklist.mutateAsync(checklistSelection);
    setChecklistOpen(false);
  };

  const downloadAllApproved = async () => {
    setDownloadingAll(true);
    setDownloadError(null);
    try {
      const response = await authorizedFetch(`/projects/${project.id}/output-documents/download-all`);
      if (!response.ok) throw new Error(translateI18n("outputUi.approvedDownloadFailed"));
      const blobUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = `${project.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_approved_outputs.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      setDownloadError("outputUi.approvedDownloadFailed");
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
        {submissionSelectionMode && canUpload && <div className="flex flex-col gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm">{translateI18n("outputUi.draftsSelected", { count: submitSelection.length })}</p><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={submissionOperation !== null} onClick={() => setSubmitSelection(submittableDocuments.map((document) => document.key))}>{translateI18n("outputUi.selectAllDrafts")}</Button><Button type="button" size="sm" variant="outline" disabled={submissionOperation !== null || submitSelection.length === 0} onClick={() => setSubmitSelection([])}>{translateI18n("outputUi.clearSelection")}</Button><Button type="button" size="sm" variant="outline" disabled={submissionOperation !== null} onClick={() => { setSubmitSelection([]); setSubmissionSelectionMode(false); }}>{translateI18n("copy.cancelSelection")}</Button><Button type="button" size="sm" aria-busy={isBatchSubmissionOperation(submissionOperation) || undefined} disabled={submissionOperation !== null || submitSelection.length === 0} onClick={() => void submitSelected()}>{isBatchSubmissionOperation(submissionOperation) ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}{isBatchSubmissionOperation(submissionOperation) ? translateI18n("outputUi.submittingSelected") : translateI18n("outputUi.submitSelected", { count: submitSelection.length })}</Button></div></div>}
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
              {group.documents.map((document) => <OutputDocumentRow key={document.key} projectId={project.id} document={document} canUpload={canUpload} canReview={isHeadSa} canReadHistory={canReadHistory} hasAssignedPic={Boolean(project.pic?.id)} role={user?.role} submissionSelectionMode={submissionSelectionMode} submissionOperation={submissionOperation} approvalSelectionMode={approvalSelectionMode} reviewOperation={reviewOperation} reviewPending={review.isPending} submitChecked={submitSelection.includes(document.key)} approveChecked={approveSelection.includes(document.key)} onSubmit={() => void submitDocuments([document.key], { kind: "single", documentKey: document.key })} onApprove={() => void approveDocuments([document.key], { kind: "single", documentKey: document.key })} onToggleSubmit={() => setSubmitSelection((current) => current.includes(document.key) ? current.filter((key) => key !== document.key) : [...current, document.key])} onToggleApprove={() => setApproveSelection((current) => current.includes(document.key) ? current.filter((key) => key !== document.key) : [...current, document.key])} onRevision={() => { setRevisionTarget(document); setRevisionFeedback(""); }} onHistory={() => setHistoryDocument(document)} />)}
            </div>
          </div>
        ))}
      </div>

      {revisionTarget && <Dialog open onOpenChange={(open) => !open && !review.isPending && setRevisionTarget(null)}><DialogHeader><DialogTitle>{translateI18n("copy.requestRevision")}</DialogTitle><DialogDescription>{translateOutputName(revisionTarget.key, revisionTarget.name)}</DialogDescription></DialogHeader><form onSubmit={requestRevision} className="space-y-4"><div><label htmlFor="output-revision-feedback" className="mb-1 block text-xs font-medium">{translateI18n("copy.reason")}</label><textarea id="output-revision-feedback" required maxLength={2000} value={revisionFeedback} onChange={(event) => setRevisionFeedback(event.target.value)} className="min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm" /></div><DialogFooter><Button type="button" variant="outline" disabled={review.isPending} onClick={() => setRevisionTarget(null)}>{translateI18n("common.cancel")}</Button><Button type="submit" variant="destructive" disabled={review.isPending || !revisionFeedback.trim()}>{review.isPending ? translateI18n("outputUi.saving") : translateI18n("outputUi.requestRevision")}</Button></DialogFooter></form></Dialog>}
      {historyDocument && <VersionHistoryDialog projectId={project.id} document={historyDocument} onClose={() => setHistoryDocument(null)} />}
      <Dialog open={checklistOpen} onOpenChange={(open) => !updateChecklist.isPending && setChecklistOpen(open)}><DialogHeader><DialogTitle>{translateI18n("copy.optionalOutputs")}</DialogTitle><DialogDescription>{translateI18n("copy.outputLockHelp")}</DialogDescription></DialogHeader><div className="max-h-[55vh] space-y-2 overflow-y-auto">{documents.map((document) => <label key={document.key} className="flex items-center justify-between gap-3 rounded-md border border-border/50 p-3 text-sm"><span className="flex min-w-0 items-center gap-2"><input type="checkbox" disabled={document.isRequired} checked={document.isRequired || checklistSelection.includes(document.key)} onChange={() => setChecklistSelection((current) => current.includes(document.key) ? current.filter((key) => key !== document.key) : [...current, document.key])} className="h-4 w-4 accent-primary" /><span>{translateOutputName(document.key, document.name)}</span></span><Badge variant="secondary" className="text-[10px]">{document.isRequired ? translateI18n("outputUi.required") : translateI18n("outputUi.optional")}</Badge></label>)}</div><DialogFooter><Button type="button" variant="outline" disabled={updateChecklist.isPending} onClick={() => setChecklistOpen(false)}>{translateI18n("common.cancel")}</Button><Button type="button" disabled={updateChecklist.isPending} onClick={() => void saveChecklist()}>{updateChecklist.isPending ? translateI18n("outputUi.saving") : translateI18n("outputUi.savingList")}</Button></DialogFooter></Dialog>
    </section>
  );
}
