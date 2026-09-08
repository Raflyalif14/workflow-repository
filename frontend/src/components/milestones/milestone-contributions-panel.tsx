"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, Download, FileText, MessageSquareText, Paperclip, Plus, UploadCloud, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useCreateMilestoneContribution,
  useDownloadMilestoneContributionAttachment,
  useMilestoneContributions,
  usePromoteMilestoneContributionAttachment,
} from "@/hooks/use-milestone-contributions";
import {
  appendDocumentFiles,
  DOCUMENT_ACCEPT,
  getDocumentFileKey,
  MAX_DOCUMENT_FILES,
  removeDocumentFile,
} from "@/lib/document-file-selection";

function formatFileSize(value: number): string {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export function MilestoneContributionsPanel({
  milestoneId,
  milestoneName,
  projectId,
  canRead,
  canCreate,
  canPromote,
}: {
  milestoneId: string;
  milestoneName: string;
  projectId: string;
  canRead: boolean;
  canCreate: boolean;
  canPromote: boolean;
}) {
  const contributions = useMilestoneContributions(milestoneId, canRead);
  const createContribution = useCreateMilestoneContribution(milestoneId);
  const downloadAttachment = useDownloadMilestoneContributionAttachment(milestoneId);
  const promoteAttachment = usePromoteMilestoneContributionAttachment(projectId, milestoneId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [promotionError, setPromotionError] = useState<string | null>(null);
  const [promotionTarget, setPromotionTarget] = useState<{
    contributionId: string;
    attachmentId: string;
    fileName: string;
  } | null>(null);

  if (!canRead) return null;

  const resetDialog = () => {
    setNote("");
    setFiles([]);
    setSelectionError(null);
    setSubmitError(null);
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !createContribution.isPending) resetDialog();
    setDialogOpen(nextOpen);
  };

  const addFiles = (selected: FileList | null) => {
    if (!selected?.length) return;
    const next = appendDocumentFiles(files, selected);
    setFiles(next.files);
    setSelectionError(next.error);
    setSubmitError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if ((!note.trim() && files.length === 0) || selectionError || createContribution.isPending) return;

    setSubmitError(null);
    try {
      await createContribution.mutateAsync({ note, files });
      resetDialog();
      setDialogOpen(false);
    } catch {
      setSubmitError("Unable to add supporting input. Please try again.");
    }
  };

  const openAttachment = async (contributionId: string, attachmentId: string) => {
    setDownloadError(null);
    try {
      const result = await downloadAttachment.mutateAsync({ contributionId, attachmentId });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch {
      setDownloadError("Unable to open the supporting attachment.");
    }
  };

  const promote = async () => {
    if (!promotionTarget || promoteAttachment.isPending) return;

    setPromotionError(null);
    try {
      await promoteAttachment.mutateAsync({
        contributionId: promotionTarget.contributionId,
        attachmentId: promotionTarget.attachmentId,
      });
      setPromotionTarget(null);
    } catch {
      setPromotionError("Unable to promote the supporting document. Please try again.");
    }
  };

  const canSubmit = Boolean(note.trim() || files.length) && !selectionError && !createContribution.isPending;

  return (
    <div className="mt-3 rounded-xl border border-border/50 bg-muted/10 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-primary" />
          <div>
            <p className="text-xs font-semibold text-foreground">Supporting Input</p>
            <p className="text-[11px] text-muted-foreground">Notes and files shared for the first operational milestone.</p>
          </div>
        </div>
        {canCreate && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 self-start text-xs sm:self-auto" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add Input
          </Button>
        )}
      </div>

      {downloadError && (
        <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive" role="alert">
          {downloadError}
        </p>
      )}
      {promotionError && (
        <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive" role="alert">
          {promotionError}
        </p>
      )}

      {contributions.isLoading ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading supporting input...</p>
      ) : contributions.isError ? (
        <p className="mt-3 text-xs text-destructive">Unable to load supporting input.</p>
      ) : !contributions.data?.length ? (
        <p className="mt-3 text-xs text-muted-foreground">No supporting input yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {contributions.data.map((contribution) => (
            <div key={contribution.id} className="rounded-lg border border-border/40 bg-card/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-foreground">
                  Shared by {contribution.contributed_by?.full_name || "Project Sales"}
                  {contribution.contributed_by?.role ? ` · ${contribution.contributed_by.role}` : ""}
                </p>
                <span className="text-[10px] text-muted-foreground">{formatDateTime(contribution.created_at)}</span>
              </div>
              {contribution.note && <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{contribution.note}</p>}
              {contribution.attachments.length > 0 && (
                <div className="mt-2 space-y-2">
                  {contribution.attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex flex-col gap-2 rounded-lg border border-border/40 bg-muted/10 p-2.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-foreground">{attachment.file_name}</p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {formatFileSize(attachment.file_size)} - {attachment.mime_type}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="border-border/60 bg-muted/20 px-1.5 py-0 text-[9px] font-medium text-muted-foreground">
                              Supporting Document
                            </Badge>
                            {attachment.promotion_status === "PROMOTED" && (
                              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0 text-[9px] font-medium text-emerald-500">
                                In Repository
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 self-start sm:self-auto">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0 gap-1.5 text-xs"
                          disabled={downloadAttachment.isPending}
                          onClick={() => void openAttachment(contribution.id, attachment.id)}
                        >
                          <Download className="h-3.5 w-3.5" />
                          View / Download
                        </Button>
                        {canPromote && attachment.promotion_status === "NOT_PROMOTED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 shrink-0 gap-1.5 border-primary/30 text-xs text-primary hover:bg-primary/10"
                            disabled={promoteAttachment.isPending}
                            onClick={() => {
                              setPromotionError(null);
                              setPromotionTarget({
                                contributionId: contribution.id,
                                attachmentId: attachment.id,
                                fileName: attachment.file_name,
                              });
                            }}
                          >
                            <UploadCloud className="h-3.5 w-3.5" />
                            Promote to Repository
                          </Button>
                        )}
                        {canPromote && attachment.promotion_status === "PROMOTING" && (
                          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled>
                            <UploadCloud className="h-3.5 w-3.5" />
                            Promoting...
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={Boolean(promotionTarget)}
        onOpenChange={(open) => {
          if (!open && !promoteAttachment.isPending) setPromotionTarget(null);
        }}
      >
        <DialogHeader className="space-y-2">
          <DialogTitle>Promote to Repository</DialogTitle>
          <DialogDescription>
            Promote <span className="font-semibold text-foreground">&quot;{promotionTarget?.fileName}&quot;</span> to the official Document Repository?
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
          The original Supporting Document will remain available here.
        </p>
        {promotionError && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive" role="alert">
            {promotionError}
          </p>
        )}
        <DialogFooter className="border-t border-border/40 pt-4">
          <Button type="button" variant="outline" disabled={promoteAttachment.isPending} onClick={() => setPromotionTarget(null)}>
            Cancel
          </Button>
          <Button type="button" disabled={promoteAttachment.isPending} onClick={() => void promote()}>
            {promoteAttachment.isPending ? "Promoting..." : "Promote Document"}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogHeader>
          <DialogTitle>Add Supporting Input</DialogTitle>
          <DialogDescription>{milestoneName}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label htmlFor={`contribution-note-${milestoneId}`} className="mb-1 block text-xs font-semibold text-foreground">
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id={`contribution-note-${milestoneId}`}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setSubmitError(null);
              }}
              maxLength={4000}
              rows={4}
              disabled={createContribution.isPending}
              className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Add context for the assigned PIC..."
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold text-foreground">Files <span className="font-normal text-muted-foreground">(optional)</span></p>
            <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/15 px-4 text-center transition-colors hover:border-primary/30 hover:bg-muted/25">
              <Paperclip className="mb-2 h-6 w-6 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">Choose one or more files</span>
              <span className="mt-0.5 text-[11px] text-muted-foreground">Up to {MAX_DOCUMENT_FILES} files, 50 MB each</span>
              <Input
                type="file"
                accept={DOCUMENT_ACCEPT}
                multiple
                className="hidden"
                disabled={createContribution.isPending}
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
          </div>

          {files.length > 0 && (
            <div className="max-h-36 space-y-2 overflow-y-auto pr-1">
              {files.map((file, index) => (
                <div key={getDocumentFileKey(file)} className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/15 px-3 py-2">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{file.name}</p>
                    <p className="text-[11px] text-muted-foreground">{formatFileSize(file.size)}</p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={createContribution.isPending}
                    onClick={() => {
                      setFiles((current) => removeDocumentFile(current, index));
                      setSelectionError(null);
                    }}
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {(selectionError || submitError) && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{selectionError || submitError}</span>
            </div>
          )}

          <DialogFooter className="border-t border-border/40 pt-4">
            <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)} disabled={createContribution.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {createContribution.isPending ? "Adding..." : "Add Input"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
