"use client";

import { useMemo } from "react";
import {
  Clock,
  PlayCircle,
  FileCheck2,
  CheckCircle2,
  Calendar,
  User,
  FileText,
  ArrowRight,
  AlertCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { translate as translateI18n, translateOutputName } from "@/i18n";
import { formatMilestoneDate } from "@/lib/dates";
import type { MilestoneApprovalState } from "@/hooks/use-milestone-workflow";
import type { Project, ProjectMilestonePhase4, ProjectOutputDocumentItem } from "@/types/project";

export type KanbanColumnKey = "NOT_STARTED" | "IN_PROGRESS" | "UNDER_REVIEW" | "COMPLETED";

interface KanbanColumnConfig {
  key: KanbanColumnKey;
  labelKey: "kanban.notStarted" | "kanban.inProgress" | "kanban.underReview" | "kanban.completed";
  icon: typeof Clock;
  headerBg: string;
  badgeStyle: string;
  borderColor: string;
}

const COLUMNS: KanbanColumnConfig[] = [
  {
    key: "NOT_STARTED",
    labelKey: "kanban.notStarted",
    icon: Clock,
    headerBg: "bg-muted/40",
    badgeStyle: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20",
    borderColor: "border-t-slate-400 dark:border-t-slate-500",
  },
  {
    key: "IN_PROGRESS",
    labelKey: "kanban.inProgress",
    icon: PlayCircle,
    headerBg: "bg-blue-500/5",
    badgeStyle: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
    borderColor: "border-t-blue-500",
  },
  {
    key: "UNDER_REVIEW",
    labelKey: "kanban.underReview",
    icon: FileCheck2,
    headerBg: "bg-amber-500/5",
    badgeStyle: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    borderColor: "border-t-amber-500",
  },
  {
    key: "COMPLETED",
    labelKey: "kanban.completed",
    icon: CheckCircle2,
    headerBg: "bg-emerald-500/5",
    badgeStyle: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    borderColor: "border-t-emerald-500",
  },
];

export interface ProjectMilestoneKanbanProps {
  project: Project;
  milestones: ProjectMilestonePhase4[];
  documents?: ProjectOutputDocumentItem[];
  approvalByMilestone?: Map<string, MilestoneApprovalState>;
  currentStageMilestone?: ProjectMilestonePhase4 | null;
  onStartMilestone?: (milestoneId: string) => void;
  isStartingMilestone?: boolean;
  onSelectMilestone: (milestoneId: string) => void;
}

export function ProjectMilestoneKanban({
  project,
  milestones,
  documents = [],
  approvalByMilestone,
  currentStageMilestone,
  onStartMilestone,
  isStartingMilestone = false,
  onSelectMilestone,
}: ProjectMilestoneKanbanProps) {
  const { user } = useAuth();

  // Map milestone id to its sequential display index (1-based), exactly matching List View
  const displayIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    milestones.forEach((m, idx) => {
      map.set(m.id, idx + 1);
    });
    return map;
  }, [milestones]);

  // Map each milestone to its matching output document and column
  const columnData = useMemo(() => {
    const grouped: Record<
      KanbanColumnKey,
      Array<{
        milestone: ProjectMilestonePhase4;
        doc?: ProjectOutputDocumentItem;
        displayOrder: number;
      }>
    > = {
      NOT_STARTED: [],
      IN_PROGRESS: [],
      UNDER_REVIEW: [],
      COMPLETED: [],
    };

    milestones.forEach((milestone) => {
      const doc = documents.find(
        (d) => d.milestoneId === milestone.id && (d.isRequired || d.isSelected)
      );

      const approval = approvalByMilestone?.get(milestone.id);
      const isApprovedOrCompleted =
        milestone.status === "COMPLETED" || milestone.status === "APPROVED";
      const isDocInReview = doc?.status === "IN_REVIEW";
      const isMilestoneAwaitingReview =
        ["SUBMITTED", "APPROVAL", "WAITING_APPROVAL"].includes(milestone.status) ||
        approval?.deadlineApproval?.status === "PENDING";

      const displayOrder = displayIndexMap.get(milestone.id) ?? milestone.step_order;
      const entry = { milestone, doc, displayOrder };

      if (isApprovedOrCompleted) {
        grouped.COMPLETED.push(entry);
      } else if (isDocInReview || isMilestoneAwaitingReview) {
        grouped.UNDER_REVIEW.push(entry);
      } else if (["IN_PROGRESS", "TRIGGERED", "REJECTED"].includes(milestone.status)) {
        grouped.IN_PROGRESS.push(entry);
      } else {
        grouped.NOT_STARTED.push(entry);
      }
    });

    // Sort items within each column by displayOrder ascending
    (Object.keys(grouped) as KanbanColumnKey[]).forEach((key) => {
      grouped[key].sort((a, b) => a.displayOrder - b.displayOrder);
    });

    return grouped;
  }, [milestones, documents, approvalByMilestone, displayIndexMap]);

  const canStartStage = (milestone: ProjectMilestonePhase4) => {
    if (project.status !== "ACTIVE" || project.is_postponed) return false;
    if (milestone.status !== "CREATED") return false;
    if (currentStageMilestone?.id !== milestone.id) return false;

    const isPic = (user?.role === "SA" || user?.role === "HEAD_SA") &&
      (milestone.pic_id || project.pic?.id) === user?.id;
    return Boolean(isPic && onStartMilestone);
  };

  return (
    <div className="w-full space-y-4">
      {/* 4-column responsive grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 items-start">
        {COLUMNS.map((column) => {
          const items = columnData[column.key];
          const Icon = column.icon;

          return (
            <div
              key={column.key}
              className={`flex flex-col rounded-xl border border-border/80 ${column.headerBg} p-3 transition-colors ${column.borderColor} border-t-4 min-h-[360px]`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-foreground/80" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    {translateI18n(column.labelKey)}
                  </h3>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[11px] font-semibold px-2 py-0.5 ${column.badgeStyle}`}
                >
                  {items.length}
                </Badge>
              </div>

              {/* Column Card List */}
              <div className="mt-3 flex-1 space-y-2.5">
                {items.length === 0 ? (
                  <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-border/70 p-4 text-center">
                    <p className="text-xs text-muted-foreground">
                      {translateI18n("kanban.noStages")}
                    </p>
                  </div>
                ) : (
                  items.map(({ milestone, doc, displayOrder }) => {
                    const title = doc
                      ? translateOutputName(doc.key, doc.name)
                      : milestone.name;
                    const canStart = canStartStage(milestone);
                    const picName = milestone.pic?.full_name || milestone.pic?.fullName || project.pic?.fullName || project.pic?.full_name;
                    const picInitials = picName
                      ? picName
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()
                      : "SA";

                    return (
                      <div
                        key={milestone.id}
                        onClick={() => onSelectMilestone(milestone.id)}
                        className="group relative cursor-pointer rounded-lg border border-border/70 bg-card p-3 shadow-2xs transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelectMilestone(milestone.id);
                          }
                        }}
                      >
                        {/* Top Meta: Step order + Requirement badge */}
                        <div className="flex items-center justify-between gap-1.5 pb-2">
                          <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            {translateI18n("kanban.step", { order: displayOrder })}
                          </span>

                          <div className="flex items-center gap-1">
                            {doc?.isRequired ? (
                              <Badge
                                variant="secondary"
                                className="border border-amber-500/20 bg-amber-500/10 text-[9px] font-medium text-amber-600 dark:text-amber-400 px-1.5 py-0"
                              >
                                {translateI18n("kanban.mandatory")}
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-border/60 text-[9px] text-muted-foreground px-1.5 py-0"
                              >
                                {translateI18n("kanban.optional")}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Title */}
                        <h4 className="text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
                          {title}
                        </h4>

                        {/* Document File Status Pill */}
                        {doc && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {doc.status === "APPROVED" && (
                              <span className="inline-flex items-center gap-1 rounded-sm bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="h-3 w-3" />
                                {translateI18n("kanban.approvedBadge")}
                              </span>
                            )}
                            {doc.status === "IN_REVIEW" && (
                              <span className="inline-flex items-center gap-1 rounded-sm bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                <Clock className="h-3 w-3" />
                                {translateI18n("kanban.underReviewBadge")}
                              </span>
                            )}
                            {doc.status === "REVISION_REQUIRED" && (
                              <span className="inline-flex items-center gap-1 rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                                <AlertCircle className="h-3 w-3" />
                                {translateI18n("kanban.revisionBadge")}
                              </span>
                            )}
                            {doc.status === "DRAFT" && (
                              <span className="inline-flex items-center gap-1 rounded-sm bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                                <FileText className="h-3 w-3" />
                                {translateI18n("kanban.draftUploaded")}
                              </span>
                            )}
                            {doc.fileName && (
                              <span
                                title={doc.fileName}
                                className="inline-flex max-w-[170px] truncate items-center gap-1 text-[10px] text-muted-foreground"
                              >
                                <FileText className="h-3 w-3 shrink-0" />
                                <span className="truncate">{doc.fileName}</span>
                              </span>
                            )}
                          </div>
                        )}

                        {/* Schedule & Due Date */}
                        <div className="mt-2.5 flex items-center justify-between border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-muted-foreground/70" />
                            <span>
                              {milestone.due_date
                                ? translateI18n("kanban.dueOn", {
                                    date: formatMilestoneDate(milestone.due_date),
                                  })
                                : translateI18n("kanban.noDueDate")}
                            </span>
                          </div>
                          {milestone.duration_working_days ? (
                            <span className="text-[10px] text-muted-foreground/80">
                              {translateI18n("kanban.workingDays", {
                                count: milestone.duration_working_days,
                              })}
                            </span>
                          ) : null}
                        </div>

                        {/* Footer: PIC & Quick Action */}
                        <div className="mt-2 flex items-center justify-between pt-1">
                          {/* PIC badge */}
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
                              {picInitials}
                            </span>
                            <span className="max-w-[110px] truncate text-[11px]">
                              {picName || translateI18n("ui.noOwner")}
                            </span>
                          </div>

                          {/* Quick Start button for active CREATED milestone */}
                          {canStart ? (
                            <Button
                              size="sm"
                              variant="default"
                              className="h-6 gap-1 px-2 text-[11px]"
                              disabled={isStartingMilestone}
                              onClick={(e) => {
                                e.stopPropagation();
                                onStartMilestone?.(milestone.id);
                              }}
                            >
                              {isStartingMilestone ? (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  <span>{translateI18n("kanban.starting")}</span>
                                </>
                              ) : (
                                <>
                                  <PlayCircle className="h-3 w-3" />
                                  <span>{translateI18n("kanban.startStage")}</span>
                                </>
                              )}
                            </Button>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-primary opacity-0 transition-opacity group-hover:opacity-100">
                              {translateI18n("kanban.viewInList")}
                              <ArrowRight className="h-2.5 w-2.5" />
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
