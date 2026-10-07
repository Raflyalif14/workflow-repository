"use client";

import { translate as translateI18n, translateRole } from "@/i18n";
import { useLanguage } from "@/components/i18n/language-provider";

import { useEffect, useMemo, useState, useRef } from "react";
import { AlertCircle, CheckCircle2, Search, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAssignPic, useSolutionArchitects } from "@/hooks/use-projects";
import { ApiError } from '@/lib/api-client';
import { picErrorKey, retainPicRequest, type PicRequest } from '@/lib/pic-assignment-request';
import { useQueryClient } from '@tanstack/react-query';
import { projectKeys } from '@/lib/query-keys';
import { Project } from "@/types/project";

export function PicAssignmentCard({
  project,
  canAssign,
  unassignedNotice,
}: {
  project: Project;
  canAssign: boolean;
  unassignedNotice?: { message: string; tone: "neutral" | "warning" };
}) {
  useLanguage();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [baseline, setBaseline] = useState<{ revision?: string; id: string | null; name: string } | null>(null);
  const [reloading, setReloading] = useState(false);
  const busy = useRef(false);
  const intent = useRef<PicRequest | null>(null);
  const client = useQueryClient();
  const currentPic = project.pic;
  const { data: pics = [], isLoading } = useSolutionArchitects(canAssign && open);
  const assign = useAssignPic(project.id);

  useEffect(() => {
    if (open) {
      setSelected("");
      setSearch("");
      setReason("");
      setSubmitError(""); setConfirming(false); intent.current = null;
      setBaseline({ revision: project.pic_revision, id: project.pic?.id || null, name: project.pic?.full_name || project.pic?.fullName || translateI18n('ui.unassigned') });
    }
  }, [open]);

  const options = useMemo(() => {
    const term = search.trim().toLowerCase();
    return pics.filter((pic) => {
      if (pic.id === (open && baseline ? baseline.id : currentPic?.id)) return false;
      if (!term) return true;

      return `${pic.full_name} ${pic.email} ${pic.role}`
        .toLowerCase()
        .includes(term);
    });
  }, [currentPic?.id, open, baseline, pics, search]);

  const isSamePic = Boolean(baseline?.id && selected === baseline.id);
  const isReassignment = Boolean(baseline?.id);
  const canSubmit = Boolean(selected) && !isSamePic && (!isReassignment || Boolean(reason.trim()));

  const submit = async () => {
    if (!canSubmit || !canAssign || busy.current || assign.isPending || !baseline?.revision) return;
    if (!confirming) { setConfirming(true); setSubmitError(''); return; }
    busy.current = true;
    setSubmitError("");

    try {
      intent.current = retainPicRequest(intent.current, baseline.revision, { pic_id: selected, reason: reason.trim() });
      await assign.mutateAsync({ pic_id: selected, ...(reason.trim() ? { reason: reason.trim() } : {}), expected_pic_revision: intent.current.revision, request_id: intent.current.id });
      setOpen(false);
    } catch (error) {
      setSubmitError(picErrorKey(error instanceof ApiError ? error.code : undefined));
      if (error instanceof ApiError && error.code === 'PIC_CONFLICT') setConfirming(false);
    } finally { busy.current = false; }
  };
  const reload = async () => {
    if (busy.current) return;
    busy.current = true; setReloading(true);
    try {
      await client.refetchQueries({ queryKey: projectKeys.detail(project.id), type: 'active' }, { throwOnError: true });
      const latest = client.getQueryData<Project>(projectKeys.detailWithoutActivity(project.id)) || client.getQueryData<Project>(projectKeys.detail(project.id));
      if (!latest?.pic_revision) throw new Error('Unavailable');
      setBaseline({ revision: latest.pic_revision, id: latest.pic?.id || null, name: latest.pic?.full_name || latest.pic?.fullName || translateI18n('ui.unassigned') });
      intent.current = null; setConfirming(false); setSubmitError('');
    } catch { setSubmitError('picOperation.conflict'); }
    finally { busy.current = false; setReloading(false); }
  };

  return (
    <>
      <section className="border-b border-border/60 pb-4" aria-labelledby="solution-architect-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p id="solution-architect-heading" className="text-sm font-medium text-foreground">{translateI18n("role.SA")}</p>
            {currentPic ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="font-semibold text-foreground">{currentPic.full_name || currentPic.fullName}</span>
                {currentPic.role && <span className="text-muted-foreground">{translateRole(currentPic.role)}</span>}
                <span className="truncate text-xs text-muted-foreground">{currentPic.email}</span>
              </div>
            ) : unassignedNotice ? (
              <p className={`text-sm ${unassignedNotice.tone === "warning" ? "text-amber-400" : "text-muted-foreground"}`}>
                {unassignedNotice.message}
              </p>
            ) : null}
          </div>
          {canAssign && (
            <Button className="h-10 w-full gap-2 shadow-none sm:w-auto" variant="outline" onClick={() => setOpen(true)}>
              <UserCheck className="h-4 w-4" />
              {translateI18n(currentPic ? "projectAction.changePic" : "projectAction.assignPic")}
            </Button>
          )}
        </div>
      </section>

      <Dialog open={open} onOpenChange={value => { if (!busy.current && !assign.isPending) setOpen(value); }}>
        <DialogHeader>
          <DialogTitle>{translateI18n(currentPic ? "projectAction.reassignTitle" : "projectAction.assignTitle")}</DialogTitle>
          <DialogDescription>
            {currentPic
              ? translateI18n("projectAction.chooseNewArchitect", { name: project.name })
              : translateI18n("projectAction.chooseArchitect", { name: project.name })}
          </DialogDescription>
        </DialogHeader>

        {confirming && <p className="mb-3 text-sm font-medium">{translateI18n('picOperation.confirm', { before: baseline?.name || translateI18n('ui.unassigned'), after: pics.find(pic => pic.id === selected)?.full_name || selected })}</p>}
        <div className="space-y-4">
          {currentPic && (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{translateI18n("copy.currentPic")}</p>
              <p className="mt-1 font-medium text-foreground">{currentPic.full_name || currentPic.fullName}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{currentPic.email}</p>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="solution-architect-search" className="text-sm font-medium text-foreground">
              {translateI18n("projectAction.selectNewArchitect")}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="solution-architect-search"
                className="pl-9"
                disabled={confirming || assign.isPending} placeholder={translateI18n("picOperation.search")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {isLoading ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{translateI18n("copy.loadingSa")}</p>
            ) : options.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{translateI18n("copy.noEligibleSa")}</p>
            ) : (
              options.map((pic) => (
                <button
                  type="button"
                  key={pic.id}
                  disabled={confirming || assign.isPending} onClick={() => setSelected(pic.id)}
                  aria-pressed={selected === pic.id}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors ${
                    selected === pic.id
                      ? "border-primary/50 bg-primary/10"
                      : "border-border/60 bg-card/60 hover:border-primary/30 hover:bg-muted/30"
                  }`}
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected === pic.id ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                    {selected === pic.id && <CheckCircle2 className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">{pic.full_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{translateRole(pic.role)} | {pic.email}</span>
                  </span>
                </button>
              ))
            )}
          </div>

          {isSamePic && <p className="text-sm text-destructive">{translateI18n("copy.newPicDifferent")}</p>}

          {currentPic && (
            <div className="space-y-2">
              <label htmlFor="pic-reassignment-reason" className="text-sm font-medium text-foreground">
                {translateI18n("copy.reason")}
              </label>
              <textarea
                id="pic-reassignment-reason"
                rows={3}
                disabled={confirming || assign.isPending} maxLength={2000} placeholder={translateI18n("picOperation.reason")}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="flex w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">{translateI18n("copy.reasonRequired")}</p>
            </div>
          )}

          {submitError && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{translateI18n(submitError as import("@/i18n").TranslationKey)}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { if (!busy.current) setOpen(false); }} disabled={assign.isPending || reloading}>{translateI18n("common.cancel")}</Button>
          {submitError === 'picOperation.conflict' ? <Button disabled={reloading} onClick={() => void reload()}>{translateI18n('picOperation.reload')}</Button> : <>
          {confirming && <Button variant="ghost" disabled={assign.isPending} onClick={() => setConfirming(false)}>{translateI18n('common.back')}</Button>}
          <Button onClick={() => void submit()} disabled={!canSubmit || assign.isPending || !baseline?.revision}>
            {translateI18n(assign.isPending ? "common.saving" : confirming ? "picOperation.save" : currentPic ? "projectAction.reassignPic" : "projectAction.assignPic")}
          </Button></>}
        </DialogFooter>
      </Dialog>
    </>
  );
}
