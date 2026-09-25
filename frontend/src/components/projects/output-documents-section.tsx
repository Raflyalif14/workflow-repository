"use client";

import { useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Download, FileText, History, Loader2, Lock, RotateCcw, Send, UploadCloud } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  getOutputDocumentsHeaderDescription,
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
    : date.toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function OutputStatusBadge({ status }: { status: ProjectOutputDocumentItem["status"] }) {
  const labels: Record<ProjectOutputDocumentItem["status"], string> = {
    NOT_REQUIRED: "Tidak diperlukan",
    TO_DO: "Belum dikerjakan",
    DRAFT: "Draf",
    IN_REVIEW: "Dalam peninjauan",
    REVISION_REQUIRED: "Perlu revisi",
    APPROVED: "Disetujui",
  };
  const className = status === "APPROVED"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
    : status === "REVISION_REQUIRED"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : status === "IN_REVIEW"
        ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
        : "border-border/60 bg-muted/30 text-muted-foreground";
  return <Badge variant="outline" className={`text-[11px] ${className}`}>{labels[status]}</Badge>;
}

function BatchResultNotice({ results, documents, action }: { results: OutputDocumentBatchResult[]; documents: ProjectOutputDocumentItem[]; action: "submit" | "approve" | "revise" }) {
  if (!results.length) return null;
  const failed = results.filter((result) => !result.success);
  const successful = results.filter((result) => result.success);
  const succeeded = results.length - failed.length;
  return (
    <div className={`rounded-md border p-3 text-xs ${failed.length ? "border-amber-500/30 bg-amber-500/10 text-amber-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
      <p className="font-semibold">{succeeded} dokumen berhasil {action === "submit" ? "diajukan" : action === "approve" ? "disetujui" : "diminta revisi"}; {failed.length} gagal.</p>
      {successful.map((result) => <p key={result.documentKey} className="mt-1">{documents.find((document) => document.key === result.documentKey)?.name || "Dokumen output"}: berhasil.</p>)}
      {failed.length > 0 && <p className="mt-1">Coba lagi hanya dokumen yang gagal:</p>}
      {failed.map((result) => <p key={result.documentKey} className="mt-1">{documents.find((document) => document.key === result.documentKey)?.name || "Dokumen output"}: {result.message || "Aksi gagal. Coba lagi."}</p>)}
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
      setError("Ukuran berkas melebihi batas 50 MB.");
      return;
    }
    setError(null);
    setUploadSuccess(false);
    try {
      await upload.mutateAsync(file);
      setUploadSuccess(true);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Berkas gagal diunggah.");
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
      setError("Dokumen gagal dibuka.");
    }
  };

  return (
    <div className="grid min-w-0 gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.7fr)_auto] lg:items-center">
      <div className="min-w-0 space-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {submittable && submissionSelectionMode && <input type="checkbox" checked={submitChecked} onChange={onToggleSubmit} aria-label={getOutputDocumentSubmissionSelectionLabel(document.name)} className="h-4 w-4 accent-primary" />}
          {reviewable && approvalSelectionMode && <input type="checkbox" checked={approveChecked} onChange={onToggleApprove} aria-label={getOutputDocumentApprovalSelectionLabel(document.name)} className="h-4 w-4 accent-primary" />}
          <p className="min-w-0 text-sm font-semibold text-foreground">{document.name}</p>
          <Badge variant="secondary" className="text-[10px]">{document.isRequired ? "Wajib" : "Opsional"}</Badge>
          <OutputStatusBadge status={document.status} />
        </div>
        {document.fileName ? (
          <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="max-w-full truncate text-foreground">{document.fileName}</span>
            <span>{formatFileSize(document.fileSize)}</span>
            <span>{formatDate(document.uploadedAt)}</span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{document.status === "NOT_REQUIRED" ? "Tidak dipilih untuk proyek ini." : "Belum ada berkas yang diunggah."}</p>
        )}
        {document.reviewFeedback && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/10 p-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span><strong>Masukan:</strong> {document.reviewFeedback}</span>
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {uploadSuccess && !error && <p role="status" className="text-xs text-emerald-400">Berkas berhasil diunggah. Ajukan draf saat siap ditinjau.</p>}
      </div>

      <div className="min-w-0 space-y-2">
        {uploadable ? (
          <div onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop} className={`flex min-h-16 min-w-0 items-center justify-between gap-3 rounded-md border border-dashed p-3 ${dragging ? "border-primary bg-primary/10" : "border-border/70 bg-muted/10"}`}>
            <div className="min-w-0"><p className="text-xs font-medium text-foreground">{document.fileName ? "Taruh berkas pengganti di sini" : "Taruh berkas di sini"}</p><p className="text-[11px] text-muted-foreground">atau pilih satu berkas, maksimal 50 MB</p></div>
            <input ref={inputRef} type="file" className="hidden" disabled={upload.isPending} onChange={(event) => void uploadFile(event.target.files?.[0])} />
            <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1.5" disabled={upload.isPending} onClick={() => inputRef.current?.click()}>
              {upload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}{upload.isPending ? "Mengunggah..." : document.fileName ? "Ganti" : "Pilih"}
            </Button>
          </div>
        ) : null}
        {contextMessage && <p className="text-xs text-muted-foreground">{contextMessage}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        {submittable && <Button type="button" size="sm" className="gap-1.5" aria-busy={submissionState.ariaBusy || undefined} disabled={submissionState.isDisabled} onClick={onSubmit}>{submissionState.isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}{submissionState.isLoading ? "Mengajukan..." : submitAction}</Button>}
        {document.fileName && <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={download.isPending} onClick={() => void handleDownload()}><Download className="h-3.5 w-3.5" /> Download</Button>}
        {canReadHistory && Boolean(document.versionCount) && <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={onHistory}><History className="h-3.5 w-3.5" /> Riwayat ({document.versionCount})</Button>}
        {reviewable && !approvalSelectionMode && <Button type="button" size="sm" className="gap-1.5" aria-busy={reviewState.ariaBusy || undefined} disabled={reviewPending || reviewState.isDisabled} onClick={onApprove}>{reviewState.isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{reviewState.isLoading ? "Menyetujui..." : approveAction}</Button>}
        {reviewable && <Button type="button" size="sm" variant="outline" className="border-destructive/30 text-destructive" disabled={reviewPending || reviewOperation !== null} onClick={onRevision}>Minta revisi</Button>}
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
      setError("Versi dokumen gagal dibuka.");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogHeader><DialogTitle>Riwayat versi</DialogTitle><DialogDescription>{document.name}. Berkas lama tetap tersedia hanya untuk PIC dan Head SA.</DialogDescription></DialogHeader>
      <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
        {versions.isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Memuat riwayat...</p>}
        {versions.isError && <p className="py-6 text-center text-sm text-destructive">Riwayat versi gagal dimuat.</p>}
        {versions.data?.versions.map((version) => (
          <div key={version.id} className="rounded-md border border-border/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0"><p className="truncate text-sm font-medium">v{version.versionNumber} - {version.fileName}</p><p className="text-xs text-muted-foreground">Diunggah {formatDate(version.uploadedAt)} - {formatFileSize(version.fileSize)}</p></div>
              <div className="flex items-center gap-2"><OutputStatusBadge status={version.status} /><Button type="button" size="sm" variant="outline" disabled={download.isPending} onClick={() => void downloadVersion(version.id)}><Download className="mr-1.5 h-3.5 w-3.5" /> Download</Button></div>
            </div>
            {version.submissionNote && <p className="mt-2 text-xs text-muted-foreground"><strong>Catatan pengajuan:</strong> {version.submissionNote}</p>}
            {version.reviewFeedback && <p className="mt-2 text-xs text-destructive"><strong>Masukan peninjauan:</strong> {version.reviewFeedback}</p>}
          </div>
        ))}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Tutup</Button></DialogFooter>
    </Dialog>
  );
}

export function OutputDocumentsSection({ project }: OutputDocumentsSectionProps) {
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
    () => getActiveOutputDocuments(documents),
    [documents]
  );
  const isHeadSa = user?.role === "HEAD_SA";
  const isAssignedPic = (user?.role === "SA" || user?.role === "HEAD_SA") && project.pic?.id === user?.id;
  const canUpload = Boolean(isAssignedPic && project.status === "ACTIVE" && !project.is_postponed);
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

  const groups = useMemo(() => ([
    { key: "PRA_TENDER" as const, title: "Pra-Tender", documents: activeDocuments.filter((document) => document.group === "PRA_TENDER") },
    { key: "ON_SUBMISSION_TENDER" as const, title: "On Submission Tender", documents: activeDocuments.filter((document) => document.group === "ON_SUBMISSION_TENDER") },
  ]).filter((group) => group.documents.length > 0), [activeDocuments]);

  const batchItems = (keys: string[]) => keys.map((key) => {
    const document = documents.find((candidate) => candidate.key === key);
    if (!document?.currentVersionId) {
      throw new Error("Versi dokumen yang dipilih tidak tersedia. Muat ulang lalu coba lagi.");
    }
    return { document_key: key, expected_version_id: document.currentVersionId };
  });

  const submissionItems = (keys: string[]) => {
    const submittableKeys = new Set(submittableDocuments.map((document) => document.key));
    if (keys.some((key) => !submittableKeys.has(key))) {
      throw new Error("Draf yang dipilih tidak lagi siap diajukan. Muat ulang lalu coba lagi.");
    }
    return batchItems(keys);
  };

  const reviewItems = (keys: string[]) => {
    const reviewableKeys = new Set(reviewableDocuments.map((document) => document.key));
    if (keys.some((key) => !reviewableKeys.has(key))) {
      throw new Error("Output yang dipilih tidak lagi siap ditinjau. Muat ulang lalu coba lagi.");
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
      setBatchResults(keys.map((documentKey) => ({ documentKey, success: false, message: error instanceof Error ? error.message : "Pengajuan gagal." })));
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
        setCompletionRetryMessage("Dokumen disetujui, tetapi status proyek masih perlu diperbarui melalui Coba lagi penyelesaian.");
      }
    } catch (error) {
      setBatchResults(keys.map((documentKey) => ({ documentKey, success: false, message: error instanceof Error ? error.message : "Persetujuan gagal." })));
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
      setBatchResults([{ documentKey: revisionTarget.key, success: false, message: error instanceof Error ? error.message : "Permintaan revisi gagal." }]);
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
      if (!response.ok) throw new Error("Dokumen yang disetujui gagal diunduh.");
      const blobUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = `${project.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_approved_outputs.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Dokumen yang disetujui gagal diunduh.");
    } finally {
      setDownloadingAll(false);
    }
  };

  const retryProjectCompletion = async () => {
    setCompletionRetryMessage(null);
    try {
      const result = await retryCompletion.mutateAsync();
      setCompletionRetryMessage(result.retried
        ? "Proyek masuk tahap menunggu hasil."
        : `Status proyek sudah ${result.status.replaceAll("_", " ").toLowerCase()}.`);
    } catch (error) {
      setCompletionRetryMessage(error instanceof Error ? error.message : "Penyelesaian proyek gagal dicoba ulang.");
    }
  };

  return (
    <Card id="output-documents" tabIndex={-1} className="min-w-0 scroll-mt-20 border-border/60 bg-card/70 shadow-none focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background">
      <CardHeader className="space-y-4 border-b border-border/40 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><FileText className="h-4 w-4 text-primary" /><CardTitle className="text-base">Output dokumen</CardTitle>{isScopeLocked && <Badge variant="secondary" className="gap-1 text-[11px]"><Lock className="h-3 w-3" /> Daftar terkunci</Badge>}</div>
            <CardDescription className="mt-1">{getOutputDocumentsHeaderDescription(user?.role)}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {isSalesOwner && !isScopeLocked && <Button type="button" size="sm" variant="outline" onClick={openChecklist}>Ubah output opsional</Button>}
            {canUpload && submittableDocuments.length >= 2 && !submissionSelectionMode && <Button type="button" size="sm" variant="outline" onClick={() => setSubmissionSelectionMode(true)}>Pilih beberapa</Button>}
            {isHeadSa && reviewableDocuments.length >= 2 && !approvalSelectionMode && <Button type="button" size="sm" variant="outline" onClick={() => { setApproveSelection(getOutputDocumentApprovalSelection(reviewableDocuments, false)); setApprovalSelectionMode(true); }}>Pilih beberapa</Button>}
            {approvedCount > 0 && <Button type="button" size="sm" variant="outline" disabled={downloadingAll} onClick={() => void downloadAllApproved()}>{downloadingAll ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}Unduh semua yang disetujui ({approvedCount})</Button>}
            {outputQuery.data?.canRetryCompletion && <Button type="button" size="sm" disabled={retryCompletion.isPending} onClick={() => void retryProjectCompletion()}>{retryCompletion.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}Coba lagi penyelesaian</Button>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {(["TO_DO", "DRAFT", "IN_REVIEW", "REVISION_REQUIRED", "APPROVED"] as const).map((status) => <div key={status} className="rounded-md border border-border/50 px-3 py-2"><p className="text-lg font-semibold">{activeDocuments.filter((document) => document.status === status).length}</p><p className="text-[11px] text-muted-foreground">{{ TO_DO: "Belum dikerjakan", DRAFT: "Draf", IN_REVIEW: "Ditinjau", REVISION_REQUIRED: "Perlu revisi", APPROVED: "Disetujui" }[status]}</p></div>)}
          <div className="rounded-md border border-border/50 px-3 py-2"><p className="text-lg font-semibold">{activeDocuments.length}</p><p className="text-[11px] text-muted-foreground">total</p></div>
        </div>
        {submissionSelectionMode && canUpload && <div className="flex flex-col gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm">{submitSelection.length} draf dipilih untuk diajukan.</p><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={submissionOperation !== null} onClick={() => setSubmitSelection(submittableDocuments.map((document) => document.key))}>Pilih semua draf</Button><Button type="button" size="sm" variant="outline" disabled={submissionOperation !== null || submitSelection.length === 0} onClick={() => setSubmitSelection([])}>Hapus pilihan</Button><Button type="button" size="sm" variant="outline" disabled={submissionOperation !== null} onClick={() => { setSubmitSelection([]); setSubmissionSelectionMode(false); }}>Batal memilih</Button><Button type="button" size="sm" aria-busy={isBatchSubmissionOperation(submissionOperation) || undefined} disabled={submissionOperation !== null || submitSelection.length === 0} onClick={() => void submitSelected()}>{isBatchSubmissionOperation(submissionOperation) ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}{isBatchSubmissionOperation(submissionOperation) ? "Mengajukan..." : `Ajukan ${submitSelection.length} dipilih`}</Button></div></div>}
        {approvalSelectionMode && isHeadSa && <div className="flex flex-col gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm">{approveSelection.length} dokumen dipilih untuk disetujui.</p><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={review.isPending || reviewOperation !== null} onClick={() => setApproveSelection(getOutputDocumentApprovalSelection(reviewableDocuments, true))}>Pilih semua yang ditinjau</Button><Button type="button" size="sm" variant="outline" disabled={review.isPending || reviewOperation !== null || approveSelection.length === 0} onClick={() => setApproveSelection(getOutputDocumentApprovalSelection(reviewableDocuments, false))}>Hapus pilihan</Button><Button type="button" size="sm" variant="outline" disabled={review.isPending || reviewOperation !== null} onClick={() => { setApproveSelection(getOutputDocumentApprovalSelection(reviewableDocuments, false)); setApprovalSelectionMode(false); }}>Batal memilih</Button>{approveSelection.length > 0 && <Button type="button" size="sm" aria-busy={isBatchReviewOperation(reviewOperation) || undefined} disabled={review.isPending || reviewOperation !== null} onClick={() => void approveSelected()}>{isBatchReviewOperation(reviewOperation) ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}{isBatchReviewOperation(reviewOperation) ? "Menyetujui..." : `Setujui ${approveSelection.length} dipilih`}</Button>}</div></div>}
        <BatchResultNotice results={batchResults} documents={documents} action={batchAction} />
        {completionRetryMessage && <p className="text-xs text-muted-foreground">{completionRetryMessage}</p>}
        {downloadError && <p className="text-xs text-destructive">{downloadError}</p>}
      </CardHeader>

      <CardContent className="min-w-0 space-y-5 p-3 sm:p-5">
        {outputQuery.isLoading && <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Memuat output...</div>}
        {outputQuery.isError && <div className="flex items-center justify-center gap-2 py-8 text-sm text-destructive"><AlertCircle className="h-4 w-4" /> Output dokumen gagal dimuat.</div>}
        {!outputQuery.isLoading && !outputQuery.isError && activeDocuments.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Belum ada output dokumen yang dipilih untuk proyek ini.</p>}
        {groups.map((group) => (
          <section key={group.key} className="min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">{group.title}</h3><p className="text-xs text-muted-foreground">{group.documents.length} output</p></div><p className="text-xs text-muted-foreground">{group.documents.filter((document) => document.status === "APPROVED").length} disetujui</p></div>
            <div className="min-w-0 divide-y divide-border/50 overflow-hidden rounded-md border border-border/60">
              {group.documents.map((document) => <OutputDocumentRow key={document.key} projectId={project.id} document={document} canUpload={canUpload} canReview={isHeadSa} canReadHistory={canReadHistory} hasAssignedPic={Boolean(project.pic?.id)} role={user?.role} submissionSelectionMode={submissionSelectionMode} submissionOperation={submissionOperation} approvalSelectionMode={approvalSelectionMode} reviewOperation={reviewOperation} reviewPending={review.isPending} submitChecked={submitSelection.includes(document.key)} approveChecked={approveSelection.includes(document.key)} onSubmit={() => void submitDocuments([document.key], { kind: "single", documentKey: document.key })} onApprove={() => void approveDocuments([document.key], { kind: "single", documentKey: document.key })} onToggleSubmit={() => setSubmitSelection((current) => current.includes(document.key) ? current.filter((key) => key !== document.key) : [...current, document.key])} onToggleApprove={() => setApproveSelection((current) => current.includes(document.key) ? current.filter((key) => key !== document.key) : [...current, document.key])} onRevision={() => { setRevisionTarget(document); setRevisionFeedback(""); }} onHistory={() => setHistoryDocument(document)} />)}
            </div>
          </section>
        ))}
      </CardContent>

      {revisionTarget && <Dialog open onOpenChange={(open) => !open && !review.isPending && setRevisionTarget(null)}><DialogHeader><DialogTitle>Minta revisi</DialogTitle><DialogDescription>{revisionTarget.name}</DialogDescription></DialogHeader><form onSubmit={requestRevision} className="space-y-4"><div><label htmlFor="output-revision-feedback" className="mb-1 block text-xs font-medium">Alasan</label><textarea id="output-revision-feedback" required maxLength={2000} value={revisionFeedback} onChange={(event) => setRevisionFeedback(event.target.value)} className="min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm" /></div><DialogFooter><Button type="button" variant="outline" disabled={review.isPending} onClick={() => setRevisionTarget(null)}>Batal</Button><Button type="submit" variant="destructive" disabled={review.isPending || !revisionFeedback.trim()}>{review.isPending ? "Menyimpan..." : "Minta revisi"}</Button></DialogFooter></form></Dialog>}
      {historyDocument && <VersionHistoryDialog projectId={project.id} document={historyDocument} onClose={() => setHistoryDocument(null)} />}
      <Dialog open={checklistOpen} onOpenChange={(open) => !updateChecklist.isPending && setChecklistOpen(open)}><DialogHeader><DialogTitle>Ubah output opsional</DialogTitle><DialogDescription>Output wajib selalu dipilih. Daftar output opsional terkunci setelah rencana disetujui.</DialogDescription></DialogHeader><div className="max-h-[55vh] space-y-2 overflow-y-auto">{documents.map((document) => <label key={document.key} className="flex items-center justify-between gap-3 rounded-md border border-border/50 p-3 text-sm"><span className="flex min-w-0 items-center gap-2"><input type="checkbox" disabled={document.isRequired} checked={document.isRequired || checklistSelection.includes(document.key)} onChange={() => setChecklistSelection((current) => current.includes(document.key) ? current.filter((key) => key !== document.key) : [...current, document.key])} className="h-4 w-4 accent-primary" /><span>{document.name}</span></span><Badge variant="secondary" className="text-[10px]">{document.isRequired ? "Wajib" : "Opsional"}</Badge></label>)}</div><DialogFooter><Button type="button" variant="outline" disabled={updateChecklist.isPending} onClick={() => setChecklistOpen(false)}>Batal</Button><Button type="button" disabled={updateChecklist.isPending} onClick={() => void saveChecklist()}>{updateChecklist.isPending ? "Menyimpan..." : "Simpan daftar"}</Button></DialogFooter></Dialog>
    </Card>
  );
}
