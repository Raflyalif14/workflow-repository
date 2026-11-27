"use client";

import { ApiError } from "@/lib/api-client";
import { picErrorKey, retainPicRequest, type PicRequest } from "@/lib/pic-assignment-request";
import { runConfirmedDecision } from "@/lib/phase-review";
import { useLanguage } from "@/components/i18n/language-provider";
import { translate as translateI18n, translateRole, translateStoredError } from "@/i18n";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getReviewActionCopy, isProjectPlanPicRequired } from "@/lib/review-surface-ux";
import { useSolutionArchitects } from "@/hooks/use-projects";

export function PlanReviewDialog({
  open,
  onOpenChange,
  decision,
  projectName,
  phaseName,
  approvalId,
  targetApprovalId,
  picRevision, currentPicName, currentPicId, onConflictReload,
  approvalStatus,
  workflowModel,
  workflowVersion,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decision: "APPROVE" | "REJECT";
  projectName: string;
  phaseName: string;
  approvalId?: string;
  targetApprovalId?: string;
  picRevision?: string; currentPicName?: string; currentPicId?: string; onConflictReload: () => Promise<void>;
  approvalStatus?: string;
  workflowModel?: string | null;
  workflowVersion?: number | null;
  onSubmit: (note?: string, picId?: string, expectedApprovalId?: string, expectedPicRevision?: string, requestId?: string) => Promise<void>;
  isPending: boolean;
}) {
  useLanguage();
  const [reviewedApprovalId, setReviewedApprovalId] = useState<string | undefined>();
  const [reviewedPicName, setReviewedPicName] = useState("");
  const [reviewedRevision, setReviewedRevision] = useState<string | undefined>();
  const intent = useRef<PicRequest | null>(null);
  const busy = useRef(false);
  const [note, setNote] = useState("");
  const [picId, setPicId] = useState("");
  const [error, setError] = useState("");
  const reviewCopy = getReviewActionCopy("PROJECT_PLAN", decision);
  const requiresPic = isProjectPlanPicRequired(
    decision,
    workflowModel,
    workflowVersion
  );
  const { data: pics = [], isLoading: picsLoading, isError: picsError } = useSolutionArchitects(open && requiresPic);

  useEffect(() => {
    if (!open) return;
    intent.current = null;
    setReviewedApprovalId(targetApprovalId);
    if (picRevision !== undefined) {
      setReviewedRevision(picRevision);
    }
    setReviewedPicName(currentPicName || translateI18n('ui.unassigned'));
    setNote("");
    setPicId(currentPicId || "");
    setError("");
  }, [decision, open, targetApprovalId, currentPicId]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (error === "businessAudit.stale" || busy.current || isPending) return;
    if (decision === "REJECT" && !note.trim()) {
      setError("projectDetail.planReasonRequired");
      return;
    }
    if (requiresPic && !picId) {
      setError("projectDetail.picBeforeApproval");
      return;
    }
    if (workflowModel === 'OPERATIONAL_V2' && picRevision === undefined) {
      setError('picOperation.reviewUnavailable');
      return;
    }
    const replayingReceipt = !!intent.current && error === 'picOperation.failed';
    if ((approvalId && reviewedApprovalId && approvalId !== reviewedApprovalId) || (approvalStatus !== 'PENDING' && !replayingReceipt)) {
      setError('reviewConfirm.stale');
      return;
    }
    setError("");
    busy.current = true;
    let decisionStarted = false;
    try {
      const activeRevision = reviewedRevision !== undefined ? reviewedRevision : picRevision;
      if (activeRevision !== undefined) {
        intent.current = retainPicRequest(intent.current, activeRevision, { approval: reviewedApprovalId, decision, note: note.trim(), picId });
      }
      await runConfirmedDecision({
        confirmed: true,
        current: true,
        reason: note,
        reasonRequired: decision === "REJECT"
      }, () => {
        decisionStarted = true;
        return onSubmit(note.trim() || undefined, requiresPic ? picId : undefined, reviewedApprovalId, intent.current?.revision, intent.current?.id);
      });
      setNote("");
      setPicId(currentPicId || "");
    } catch (reviewError) {
      const code = reviewError instanceof ApiError ? reviewError.code : undefined;
      setError(!decisionStarted ? 'picOperation.preparationFailed' : reviewError instanceof ApiError && reviewError.status === 409 && !code ? "businessAudit.stale" : picErrorKey(code));
      if (code === 'PIC_CONFLICT') {
        intent.current = null;
        try { await onConflictReload(); } catch { setError('picOperation.conflict'); }
      }
    } finally {
      busy.current = false;
    }
  };

  const selectedPic = pics.find(pic => pic.id === picId);
  const currentPicFullName = currentPicName || reviewedPicName;
  const selectedPicFullName = selectedPic?.full_name || (picId ? picId : undefined);

  return (
    <Dialog open={open} onOpenChange={value => !busy.current && !isPending && onOpenChange(value)}>
      <DialogHeader className="mb-4">
        <DialogTitle>{reviewCopy.title}</DialogTitle>
        <DialogDescription>{projectName} · {phaseName}. {translateI18n('reviewConfirm.plan')}</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label
            htmlFor="project-plan-review-note"
            className="mb-1 block text-xs font-semibold text-muted-foreground"
          >
            {reviewCopy.noteLabel}
            {reviewCopy.noteRequired && " *"}
          </label>
          <textarea
            id="project-plan-review-note"
            rows={4}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setError("");
            }}
            placeholder={reviewCopy.notePlaceholder}
            className="flex w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            required={reviewCopy.noteRequired}
            aria-invalid={Boolean(error) && reviewCopy.noteRequired}
            aria-describedby={error ? "project-plan-review-error" : undefined}
            disabled={isPending}
          />
        </div>
        {requiresPic && (
          <div className="space-y-2">
            <label htmlFor="project-plan-pic" className="block text-xs font-semibold text-muted-foreground">
              {translateI18n("projectDetail.picRequired")}
            </label>
            {picsLoading ? (
              <p className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                {translateI18n("projectDetail.loadingEligible")}
              </p>
            ) : picsError ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {translateI18n("projectDetail.eligibleFailed")}
              </p>
            ) : (
              <select
                id="project-plan-pic"
                value={picId}
                onChange={(event) => {
                  setPicId(event.target.value);
                  setError("");
                }}
                className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
                disabled={isPending || !!currentPicId}
              >
                <option value="">{translateI18n("copy.selectSa")}</option>
                {currentPicId&&!pics.some(pic=>pic.id===currentPicId)&&<option value={currentPicId}>{currentPicName||currentPicId}</option>}
                {pics.map((pic) => (
                  <option key={pic.id} value={pic.id}>
                    {pic.full_name} ({translateRole(pic.role)}) - {pic.email}
                  </option>
                ))}
              </select>
            )}
            {selectedPicFullName && (
              <p className="text-xs text-muted-foreground font-medium">
                {currentPicFullName && selectedPicFullName && currentPicFullName !== selectedPicFullName && currentPicFullName !== translateI18n('ui.unassigned')
                  ? translateI18n('picOperation.reviewPic', { before: currentPicFullName, after: selectedPicFullName })
                  : translateI18n('picOperation.currentPic', { name: selectedPicFullName })}
              </p>
            )}
            {!picsLoading && !picsError && !picId && (
              <p className="text-xs text-muted-foreground">
                {translateI18n("projectDetail.picRequiredActivation")}
              </p>
            )}
          </div>
        )}
        {error && (
          <p
            id="project-plan-review-error"
            className="text-sm text-destructive"
            role="alert"
          >
            {translateStoredError(error === "reviewConfirm.failed" && (approvalId !== reviewedApprovalId || approvalStatus !== "PENDING") ? "reviewConfirm.stale" : error)}
          </p>
        )}
        <DialogFooter>
          {(error === 'picOperation.reviewUnavailable' || error === 'reviewConfirm.stale') && <Button type="button" variant="outline" disabled={isPending} onClick={async () => {
            try { await onConflictReload(); intent.current = null; setReviewedApprovalId(approvalId); setError(''); }
            catch { setError('picOperation.reviewUnavailable'); }
          }}>{translateI18n('picOperation.reload')}</Button>}
          <Button
            type="button"
            variant="outline"
            onClick={() => { setError(""); onOpenChange(false); }}
            disabled={isPending}
          >
            {translateI18n("common.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={error === "businessAudit.stale" || isPending || (requiresPic && (picsLoading || picsError || !picId))}
            variant={decision === "REJECT" ? "outline" : "default"}
            className={
              decision === "REJECT"
                ? "border-destructive/40 text-destructive hover:bg-destructive/10"
                : ""
            }
          >
            {isPending ? reviewCopy.pendingLabel : translateI18n(decision === "APPROVE" ? "reviewConfirm.approve" : "reviewConfirm.reject")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
