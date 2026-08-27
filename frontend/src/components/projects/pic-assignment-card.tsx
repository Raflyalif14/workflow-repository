"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Search, UserCheck } from "lucide-react";
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
  const currentPic = project.pic;
  const { data: pics = [], isLoading } = useSolutionArchitects();
  const assign = useAssignPic(project.id);

  useEffect(() => {
    if (open) {
      setSelected("");
      setSearch("");
      setReason("");
    }
  }, [open]);

  const options = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return pics;
    return pics.filter((pic) => `${pic.full_name} ${pic.email} ${pic.role}`.toLowerCase().includes(term));
  }, [pics, search]);

  const isSamePic = Boolean(currentPic && selected === currentPic.id);
  const isReassignment = Boolean(currentPic);
  const canSubmit = Boolean(selected) && !isSamePic && (!isReassignment || Boolean(reason.trim()));

  const submit = async () => {
    if (!canSubmit) return;
    await assign.mutateAsync({ pic_id: selected, ...(reason.trim() ? { reason: reason.trim() } : {}) });
    setOpen(false);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Solution Architect</CardTitle>
          <UserCheck className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          {currentPic ? (
            <div className="space-y-1">
              <p className="font-semibold">{currentPic.full_name || currentPic.fullName}</p>
              <Badge variant="outline">{currentPic.role}</Badge>
              <p className="text-xs text-muted-foreground">{currentPic.email}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No PIC assigned</p>
          )}
          {canAssign && (
            <Button className="mt-4 gap-2" variant="outline" onClick={() => setOpen(true)}>
              <UserCheck className="h-4 w-4" />
              {currentPic ? "Reassign PIC" : "Assign PIC"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogHeader>
          <DialogTitle>{currentPic ? "Reassign Solution Architect" : "Assign Solution Architect"}</DialogTitle>
          <DialogDescription>{project.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {currentPic && (
            <div className="rounded-md border border-border/70 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current PIC</p>
              <p className="mt-1 font-medium">{currentPic.full_name || currentPic.fullName}</p>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>

          <div className="max-h-64 space-y-2 overflow-y-auto">
            {isLoading ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Loading Solution Architects...</p>
            ) : options.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No Solution Architects found.</p>
            ) : (
              options.map((pic) => (
                <button
                  type="button"
                  key={pic.id}
                  onClick={() => setSelected(pic.id)}
                  className={`flex w-full items-center gap-3 rounded-md border p-3 text-left text-sm transition ${
                    selected === pic.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                  }`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${selected === pic.id ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                    {selected === pic.id && <CheckCircle2 className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{pic.full_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{pic.role} | {pic.email}</span>
                  </span>
                </button>
              ))
            )}
          </div>

          {isSamePic && <p className="text-sm text-destructive">New PIC must be different from the current PIC.</p>}

          {currentPic && (
            <textarea
              rows={3}
              placeholder="Reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={!canSubmit || assign.isPending}>
            {assign.isPending ? "Saving..." : currentPic ? "Reassign" : "Assign"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
