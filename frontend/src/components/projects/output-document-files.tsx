"use client";
import { BusinessConfirmation } from "./business-confirmation";

import { unresolvedFileRevisions } from "@/lib/output-file-revisions";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { Download, FileText, Loader2, Plus, RefreshCw, RotateCcw, Trash2, UploadCloud } from "lucide-react";
import { useLanguage } from "@/components/i18n/language-provider";
import { Button } from "@/components/ui/button";
import { translate, translateOutputName, translateStoredError } from "@/i18n";
import {
  useOutputDocumentFileDownload,
  useRemoveOutputDocumentFile,
  useUploadOutputDocument,
} from "@/hooks/use-output-documents";
import { DOCUMENT_ACCEPT } from "@/lib/document-file-selection";
import {
  getDraftUploadError,
  getOutputDraftReloadRevision,
  hasUnfinishedDraftUploads,
  uploadOutputDraftQueue,
  validateOutputDraftSelection,
  type DraftUploadItem,
} from "@/lib/output-document-draft";
import type { ProjectOutputDocumentItem } from "@/types/project";

export function formatOutputFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "-";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function OutputDocumentFiles({ projectId, document, editable, blocked, onBusyChange, refreshDraft }: {
  projectId: string;
  document: ProjectOutputDocumentItem;
  editable: boolean;
  blocked: boolean;
  onBusyChange: (documentKey: string, busy: boolean) => void;
  refreshDraft: (documentKey: string) => Promise<ProjectOutputDocumentItem>;
}) {
  useLanguage();
  const upload = useUploadOutputDocument(projectId, document.key);
  const remove = useRemoveOutputDocumentFile(projectId, document.key);
  const download = useOutputDocumentFileDownload(projectId, document.key);
  const inputRef = useRef<HTMLInputElement>(null);
  const replacementRef = useRef<string | undefined>(undefined);
  const revisionRef = useRef(document.draftRevision ?? 0);
  const removalRequests = useRef(new Map<string, { expected_draft_revision: number; request_id: string }>());
  const runningRef = useRef(false);
  const [confirmation, setConfirmation] = useState<"UPLOAD" | string | null>(null);
  const [queue, setQueue] = useState<DraftUploadItem[]>([]);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const busy = running || removingId !== null || hasUnfinishedDraftUploads(queue)
    || error === "outputFiles.refreshFailed" || error === "outputFiles.draftConflict";
  const locked = blocked || running || removingId !== null;
  const files = ["IN_REVIEW", "APPROVED"].includes(document.status)
    ? document.files || [] : document.draftFiles || [];

  useEffect(() => {
    if (!busy) revisionRef.current = document.draftRevision ?? 0;
  }, [document.draftRevision, busy]);

  useEffect(() => {
    onBusyChange(document.key, busy);
  }, [busy, document.key, onBusyChange]);

  useEffect(() => () => onBusyChange(document.key, false), [document.key, onBusyChange]);

  const runQueue = async (items: DraftUploadItem[]) => {
    if (runningRef.current || blocked || !editable) throw Object.assign(new Error("Draft changed"), { status: 409 });
    runningRef.current = true;
    onBusyChange(document.key, true);
    setRunning(true);
    setError(null);
    try {
      let failed = false; let stale = false;
      revisionRef.current = await uploadOutputDraftQueue(items, revisionRef.current,
        (item, revision) => upload.mutateAsync({ file: item.file, expected_draft_revision: revision,
          request_id: item.id, replace_file_id: item.replaceFileId }),
        (id, update) => { if (update.status === "failed") { failed = true; stale ||= update.error === "outputFiles.draftConflict"; } setQueue((current) => current.map((item) => item.id === id ? { ...item, ...update } : item)); });
      if (failed) throw Object.assign(new Error("Upload not confirmed"), { status: stale ? 409 : 503 });
      await refreshDraft(document.key);
    } catch (cause) {
      setError("outputFiles.refreshFailed"); throw cause;
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  };

  const chooseFiles = (selection: File[], replaceFileId?: string) => {
    if (!selection.length || locked || runningRef.current || !editable || hasUnfinishedDraftUploads(queue)) return;
    const validation = validateOutputDraftSelection(files, selection, replaceFileId);
    if (validation) { setError(validation); return; }
    const items: DraftUploadItem[] = selection.map((file) => ({ id: crypto.randomUUID(), file, replaceFileId, status: "pending" }));
    revisionRef.current = document.draftRevision ?? 0;
    setQueue(items);
    setConfirmation("UPLOAD");
  };

  const openPicker = (replaceFileId?: string) => {
    replacementRef.current = replaceFileId;
    if (inputRef.current) {
      inputRef.current.multiple = !replaceFileId;
      inputRef.current.click();
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    chooseFiles(Array.from(event.dataTransfer.files));
  };

  const removeFile = async (fileId: string) => {
    if (locked || busy || runningRef.current || !editable) throw Object.assign(new Error("Draft changed"), { status: 409 });
    runningRef.current = true;
    setError(null);
    setRemovingId(fileId);
    onBusyChange(document.key, true);
    let removed = false;
    try {
      let request = removalRequests.current.get(fileId);
      if (!request) {
        request = { expected_draft_revision: document.draftRevision ?? 0, request_id: crypto.randomUUID() };
        removalRequests.current.set(fileId, request);
      }
      const receipt = await remove.mutateAsync({ fileId, ...request });
      revisionRef.current = receipt.draftRevision;
      removed = true;
      removalRequests.current.delete(fileId);
      await refreshDraft(document.key);
    } catch (failure) {
      setError(removed ? "outputFiles.refreshFailed" : getDraftUploadError(failure) === "outputFiles.draftConflict" ? "outputFiles.draftConflict" : "outputFiles.removeFailed"); throw failure;
    } finally { runningRef.current = false; setRemovingId(null); }
  };

  const downloadFile = async (fileId: string) => {
    setDownloadError(null);
    setDownloadingId(fileId);
    try {
      const receipt = await download.mutateAsync({ fileId });
      window.open(receipt.url, "_blank", "noopener,noreferrer");
    } catch { setDownloadError("outputUi.openFailed"); }
    finally { setDownloadingId(null); }
  };

  const reloadDraft = async () => {
    if (runningRef.current || blocked) return;
    runningRef.current = true;
    setRunning(true);
    try {
      const current = await refreshDraft(document.key);
      if (!current || !Number.isInteger(current.draftRevision)) throw new Error();
      revisionRef.current = getOutputDraftReloadRevision(current.draftRevision!, revisionRef.current, queue);
      if (error === "outputFiles.draftConflict") removalRequests.current.clear();
      // Explicit reload confirms the new draft. Only stale, never-persisted operations
      // receive fresh IDs; ambiguous transport failures retain idempotency IDs.
      setQueue((items) => items.map((item) => item.error === "outputFiles.draftConflict"
        ? { ...item, id: crypto.randomUUID(), status: "pending", error: undefined } : item));
      setError(null);
    } catch { setError("outputFiles.refreshFailed"); }
    finally { runningRef.current = false; setRunning(false); }
  };

  return (
    <div
      className="min-w-0 space-y-2"
      onDragOver={editable && !locked ? (event) => { event.preventDefault(); setDragging(true); } : undefined}
      onDragLeave={() => setDragging(false)}
      onDrop={editable && !locked ? handleDrop : undefined}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={DOCUMENT_ACCEPT}
        className="sr-only"
        disabled={locked || busy}
        onChange={(event) => {
          chooseFiles(Array.from(event.target.files || []), replacementRef.current);
          event.target.value = "";
        }}
      />

      {editable && files.some((file) => !Number.isFinite(Number(file.fileSize)) || Number(file.fileSize) <= 0) && (
        <p className="text-xs text-warning">{translate("outputFiles.legacySizeUnknown")}</p>
      )}

      {editable && Boolean(document.fileRevisions?.length) && <div className="space-y-1 border-b border-border pb-2">
        <p className="text-xs text-muted-foreground">{translate("fileRevision.draftHelp")}</p>
        {document.fileRevisions?.map(marker => {
          const unresolved = unresolvedFileRevisions(document).some(item => item.fileId === marker.fileId);
          const original = document.files?.find(file => file.id === marker.fileId);
          return <div key={marker.fileId} className="py-1 text-xs">
            <p className={unresolved ? "font-medium text-destructive" : "font-medium text-muted-foreground"}>{original?.fileName || translate("common.notAvailable")} — {translate(unresolved ? "fileRevision.required" : "fileRevision.resolved")}</p>
            <p className="whitespace-pre-wrap break-words text-muted-foreground">{marker.feedback}</p>
          </div>;
        })}
      </div>}

      {files.length === 0 && editable && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => !locked && !busy && openPicker()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!locked && !busy) openPicker(); } }}
          className={`group flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition-all ${
            dragging
              ? "border-primary bg-primary/10 ring-2 ring-primary/20"
              : "border-border/70 bg-muted/10 hover:border-primary/50 hover:bg-muted/30"
          } ${locked || busy ? "pointer-events-none opacity-60" : ""}`}
        >
          <div className="mb-2 rounded-full bg-primary/10 p-2 text-primary transition-transform group-hover:scale-110">
            <UploadCloud className="h-5 w-5" />
          </div>
          <p className="text-xs font-medium text-foreground">
            {translate("outputFiles.uploadFiles")}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {translate("outputFiles.dropHint")}
          </p>
        </div>
      )}

      {files.length === 0 && !editable && (
        <p className="py-1 text-xs text-muted-foreground">{translate("outputUi.noFile")}</p>
      )}

      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2 text-xs transition-colors hover:border-border hover:bg-muted/20"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                  <FileText className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium text-foreground" title={file.fileName}>
                    {file.fileName}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatOutputFileSize(file.fileSize)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs hover:bg-primary/10 hover:text-primary"
                  disabled={downloadingId !== null}
                  onClick={() => void downloadFile(file.id)}
                  aria-label={translate("outputFiles.downloadFile", { name: file.fileName })}
                >
                  {downloadingId === file.id ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="mr-1 h-3.5 w-3.5 text-primary" />
                  )}
                  {translate("common.download")}
                </Button>
                {editable && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                      disabled={locked || busy}
                      onClick={() => openPicker(file.id)}
                      aria-label={translate("outputFiles.replaceFile", { name: file.fileName })}
                    >
                      <RefreshCw className="mr-1 h-3 w-3" />
                      {translate("outputUi.replace")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      disabled={locked || busy}
                      onClick={() => { if (!removalRequests.current.has(file.id)) removalRequests.current.set(file.id, { expected_draft_revision: document.draftRevision ?? 0, request_id: crypto.randomUUID() }); setConfirmation(file.id); }}
                      aria-label={translate("outputFiles.removeFile", { name: file.fileName })}
                    >
                      {removingId === file.id ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="mr-1 h-3.5 w-3.5 text-destructive" />
                      )}
                      {translate("outputFiles.remove")}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editable && files.length > 0 && files.length < 10 && (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border/60 px-3 py-1.5 transition-all ${
            dragging ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:border-border hover:bg-muted/10"
          }`}
        >
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs font-medium"
              disabled={locked || busy}
              onClick={() => openPicker()}
            >
              <Plus className="h-3.5 w-3.5 text-primary" />
              {translate("outputFiles.uploadFiles")}
            </Button>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              {translate("outputFiles.dropHint")}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {files.length} / 10
          </span>
        </div>
      )}

      {queue.length > 0 && (
        <div aria-live="polite" className="divide-y divide-border/40 text-xs">
          {queue.map((item) => (
            <div key={item.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-1.5">
              <span className="min-w-0 break-words font-medium">{item.file.name}</span>
              <span className={`flex items-center gap-1 ${item.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
                {item.status === "uploading" && <Loader2 className="h-3 w-3 animate-spin" />}
                {translate(
                  item.status === "succeeded"
                    ? "outputFiles.uploaded"
                    : item.status === "uploading"
                    ? "outputUi.uploading"
                    : item.status === "failed"
                    ? "outputFiles.failed"
                    : "outputFiles.queued"
                )}
                {item.status !== "succeeded" && !running && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setQueue((items) => items.filter((entry) => entry.id !== item.id))}
                    aria-label={translate("outputFiles.discardFile", { name: item.file.name })}
                  >
                    {translate("outputFiles.remove")}
                  </Button>
                )}
              </span>
              {item.error && <p className="w-full text-destructive">{translateStoredError(item.error)}</p>}
            </div>
          ))}
        </div>
      )}

      {hasUnfinishedDraftUploads(queue) && !running && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            disabled={blocked || !editable || queue.some((item) => item.error === "outputFiles.draftConflict")}
            onClick={() => setConfirmation("UPLOAD")}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {translate("outputFiles.retryFailed")}
          </Button>
          {queue.some((item) => item.error === "outputFiles.draftConflict") && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={blocked}
              onClick={() => void reloadDraft()}
            >
              {translate("outputFiles.reloadDraft")}
            </Button>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-xs text-destructive">{translateStoredError(error)}</p>}
      {downloadError && <p role="alert" className="text-xs text-destructive">{translateStoredError(downloadError)}</p>}
      {(error === "outputFiles.draftConflict" || error === "outputFiles.refreshFailed") && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={locked}
          onClick={() => void reloadDraft()}
        >
          {translate("outputFiles.reloadDraft")}
        </Button>
      )}
      <BusinessConfirmation open={confirmation !== null} onOpenChange={open => !open && setConfirmation(null)}
        title={translateOutputName(document.key,document.name)} changes={confirmation === "UPLOAD" ? [translate("businessAudit.files", { count: queue.filter(item => item.status !== "succeeded").length }), ...queue.filter(item => item.status !== "succeeded").map(item => `${item.replaceFileId ? (files.find(file => file.id === item.replaceFileId)?.fileName || "-") + " -> " : ""}${item.file.name}`)] : [translate("businessAudit.removeHelp"), files.find(file => file.id === confirmation)?.fileName || ""]}
        action={translate(confirmation === "UPLOAD" ? "businessAudit.upload" : "businessAudit.remove")}
        onConfirm={() => confirmation === "UPLOAD" ? runQueue(queue) : removeFile(confirmation!)} />
    </div>
  );
}
