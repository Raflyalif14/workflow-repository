"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Search, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAssignPic, useSolutionArchitects } from "@/hooks/use-projects";
import { Project } from "@/types/project";

export function PicAssignmentCard({ project, canAssign }: { project: Project; canAssign: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [submitError, setSubmitError] = useState("");
  const currentPic = project.pic;
  const { data: pics = [], isLoading } = useSolutionArchitects();
  const assign = useAssignPic(project.id);

  useEffect(() => {
    if (open) {
      setSelected("");
      setSearch("");
      setReason("");
      setSubmitError("");
    }
  }, [open]);

  const options = useMemo(() => {
    const term = search.trim().toLowerCase();
    return pics.filter((pic) => {
      if (pic.id === currentPic?.id) return false;
      if (!term) return true;

      return `${pic.full_name} ${pic.email} ${pic.role}`
        .toLowerCase()
        .includes(term);
    });
  }, [currentPic?.id, pics, search]);

  const isSamePic = Boolean(currentPic && selected === currentPic.id);
  const isReassignment = Boolean(currentPic);
  const canSubmit = Boolean(selected) && !isSamePic && (!isReassignment || Boolean(reason.trim()));

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitError("");

    try {
      await assign.mutateAsync({ pic_id: selected, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      setOpen(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to update the Solution Architect.");
    }
  };

  return (
    <>
      <Card className="h-full border-border/60 bg-card/70 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                <UserCheck className="h-4 w-4" />
              </span>
              <div className="space-y-1">
                <CardTitle className="text-base font-semibold tracking-tight">Solution Architect</CardTitle>
                <p className="text-xs text-muted-foreground">Assigned project delivery lead</p>
              </div>
            </div>
            {currentPic && <Badge variant="outline" className="shrink-0 text-[10px]">Assigned</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentPic ? (
            <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
              <p className="font-semibold text-foreground">{currentPic.full_name || currentPic.fullName}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {currentPic.role && <Badge variant="outline" className="text-[10px]">{currentPic.role}</Badge>}
                <p className="truncate text-xs text-muted-foreground">{currentPic.email}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-3 text-sm text-muted-foreground">
              No Solution Architect is assigned to this project yet.
            </div>
          )}
          {canAssign && (
            <Button className="w-full gap-2 sm:w-auto" variant="outline" onClick={() => setOpen(true)}>
              <UserCheck className="h-4 w-4" />
              {currentPic ? "Change PIC" : "Assign PIC"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogHeader>
          <DialogTitle>{currentPic ? "Reassign Solution Architect" : "Assign Solution Architect"}</DialogTitle>
          <DialogDescription>
            {currentPic
              ? `Choose a new Solution Architect for ${project.name}.`
              : `Choose a Solution Architect for ${project.name}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {currentPic && (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Current PIC</p>
              <p className="mt-1 font-medium text-foreground">{currentPic.full_name || currentPic.fullName}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{currentPic.email}</p>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="solution-architect-search" className="text-sm font-medium text-foreground">
              Select new Solution Architect
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="solution-architect-search"
                className="pl-9"
                placeholder="Search by name or email"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {isLoading ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Loading Solution Architects...</p>
            ) : options.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No eligible Solution Architects found.</p>
            ) : (
              options.map((pic) => (
                <button
                  type="button"
                  key={pic.id}
                  onClick={() => setSelected(pic.id)}
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
                    <span className="block truncate text-xs text-muted-foreground">{pic.role} | {pic.email}</span>
                  </span>
                </button>
              ))
            )}
          </div>

          {isSamePic && <p className="text-sm text-destructive">New PIC must be different from the current PIC.</p>}

          {currentPic && (
            <div className="space-y-2">
              <label htmlFor="pic-reassignment-reason" className="text-sm font-medium text-foreground">
                Reason
              </label>
              <textarea
                id="pic-reassignment-reason"
                rows={3}
                placeholder="Explain why this PIC needs to be reassigned"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="flex w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">A reason is required when changing the assigned PIC.</p>
            </div>
          )}

          {submitError && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={assign.isPending}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={!canSubmit || assign.isPending}>
            {assign.isPending ? "Saving..." : currentPic ? "Reassign PIC" : "Assign PIC"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
