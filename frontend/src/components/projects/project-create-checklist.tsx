"use client";
import { CheckCircle2, Circle, Paperclip } from "lucide-react";
import { translate as translateI18n } from "@/i18n";

function ChecklistItem({
  label,
  detail,
  complete,
  optional = false,
}: {
  label: string;
  detail: string;
  complete: boolean;
  optional?: boolean;
}) {
  const Icon = optional ? Paperclip : complete ? CheckCircle2 : Circle;

  return (
    <div className="flex items-start gap-3">
      <Icon
        className={
          complete && !optional
            ? "mt-0.5 h-4 w-4 shrink-0 text-success"
            : "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60"
        }
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {label}
          {optional && <span className="ml-1 font-normal text-muted-foreground">({translateI18n("common.optional")})</span>}
        </p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

export interface ProjectCreateChecklistProps {
  projectDetailsComplete: boolean;
  mom: File | null;
  scenarioId: string;
  allSelectedDocumentKeys: string[];
  mandatoryKeys: string[];
  selectedOptionalKeys: string[];
  photos: File[];
  documents: File[];
}

export function ProjectCreateChecklist({
  projectDetailsComplete,
  mom,
  scenarioId,
  allSelectedDocumentKeys,
  mandatoryKeys,
  selectedOptionalKeys,
  photos,
  documents,
}: ProjectCreateChecklistProps) {
  return (
    <aside className="page-surface px-5 py-5 xl:sticky xl:top-24">
      <h2 className="text-base font-semibold text-foreground">{translateI18n("copy.beforeCreate")}</h2>
      <div className="mt-5 space-y-5">
        <ChecklistItem
          label={translateI18n("projectCreate.projectInfo")}
          detail={translateI18n(projectDetailsComplete ? "projectCreate.detailsReady" : "projectCreate.detailsMissing")}
          complete={projectDetailsComplete}
        />
        <ChecklistItem
          label="MoM PDF"
          detail={mom ? mom.name : translateI18n("projectCreate.momMissing")}
          complete={Boolean(mom)}
        />
        <ChecklistItem
          label={translateI18n("ui.outputDocumentList")}
          detail={
            scenarioId
              ? translateI18n("projectCreate.outputSummary", { selected: allSelectedDocumentKeys.length, required: mandatoryKeys.length, optional: selectedOptionalKeys.length })
              : translateI18n("ui.chooseScenarioFirst")
          }
          complete={Boolean(scenarioId && allSelectedDocumentKeys.length > 0)}
        />
        <ChecklistItem
          label={translateI18n("projectCreate.projectPhotos")}
          detail={photos.length ? translateI18n("projectCreate.photosAttached", { count: photos.length }) : translateI18n("projectCreate.photosMissing")}
          complete={photos.length > 0}
        />
        <ChecklistItem
          label={translateI18n("ui.supportingDocuments")}
          detail={documents.length ? translateI18n("ui.attachedFiles", { count: documents.length }) : translateI18n("ui.noAttachedFiles")}
          complete={documents.length > 0}
          optional
        />
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-sm font-semibold text-foreground">{translateI18n("copy.nextStep")}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {translateI18n("ui.planningNext")}
        </p>
      </div>
    </aside>
  );
}
