"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { translate as translateI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import type { Project } from "@/types/project";
import { projectDisplayStatus } from '@/lib/project-display-status';
import { StatusBadge } from './project-status-badge';
import {
  getProgressPresentation,
  getProjectState,
  getResponsibleLabel,
} from "@/lib/project-list-format";

export interface ProjectListRowProps {
  project: Project;
  role: string;
}

export function ProjectListRow({ project, role }: ProjectListRowProps) {
  const progress = typeof project.progress === "number" ? project.progress : null;
  const responsible = getResponsibleLabel(project);
  const progressPresentation = getProgressPresentation(project);

  return (
    <div className="grid gap-4 border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5 xl:grid-cols-[minmax(220px,2fr)_minmax(130px,1fr)_minmax(150px,1.1fr)_minmax(150px,1fr)_auto] xl:items-center">
      <div className="min-w-0">
        <Link
          href={`/projects/${project.id}`}
          className="font-semibold text-foreground transition-colors hover:text-primary"
        >
          {project.name}
        </Link>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {project.customer}
          {project.scenario?.name ? ` | ${project.scenario.name}` : ""}
        </p>
      </div>

      <div className="flex min-w-0 items-center justify-between gap-3 xl:block">
        <span className="text-[11px] font-medium text-muted-foreground xl:hidden">
          {translateI18n("copy.state")}
        </span>
        <div className="min-w-0 text-right xl:text-left">
          <StatusBadge status={project.status} label={projectDisplayStatus(project)} />
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {getProjectState(project, role)}
          </p>
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">{progressPresentation.label}</span>
          {progressPresentation.showDeliveryProgress && (
            <span className="font-medium text-foreground">
              {progress === null ? translateI18n("common.notAvailable") : `${progress}%`}
            </span>
          )}
        </div>
        {progressPresentation.showDeliveryProgress && progress !== null && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
            />
          </div>
        )}
        {progressPresentation.showDeliveryProgress &&
          typeof project.totalMilestones === "number" &&
          typeof project.completedMilestones === "number" && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {translateI18n("projectDetail.stagesFinished", {
                done: project.completedMilestones,
                total: project.totalMilestones,
              })}
            </p>
          )}
        {progressPresentation.detail && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {progressPresentation.detail}
          </p>
        )}
      </div>

      <div className="flex min-w-0 items-center justify-between gap-3 xl:block">
        <span className="text-[11px] font-medium text-muted-foreground xl:hidden">
          {translateI18n("copy.responsible")}
        </span>
        <div className="min-w-0 text-right xl:text-left">
          <p className="truncate text-sm font-medium text-foreground">{responsible.name}</p>
          <p className="truncate text-xs text-muted-foreground">{responsible.role}</p>
        </div>
      </div>

      <Link href={`/projects/${project.id}`} className="justify-self-stretch xl:justify-self-end">
        <Button variant="ghost" size="sm" className="w-full gap-1.5 xl:w-auto">
          {translateI18n("common.open")}
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </Link>
    </div>
  );
}
