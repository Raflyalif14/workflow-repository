import { translateOutputName } from "@/i18n";
import { getTimelinePlanningMilestones } from "@/lib/workflow-ux-helpers";
import type { ProjectMilestonePhase4 } from "@/types/project";

export type TimelineDraftRow = {
  rowId: string;
  milestoneId: string;
  documentKey?: string;
  outputDocumentId?: string;
  stepOrder: number;
  name: string;
  role: string;
  isRequired?: boolean;
  startDate: string;
  durationWorkingDays: string;
  savedStartDate: string;
  savedDurationWorkingDays: string;
  dueDate: string | null;
};

export const toDraftRows = (
  milestones: ProjectMilestonePhase4[],
  outputDocs: import("@/types/project").ProjectOutputDocumentItem[] = [],
  workflowModel?: string | null,
  workflowVersion?: number | null
): TimelineDraftRow[] => {
  const planningMilestones = getTimelinePlanningMilestones(milestones, workflowModel, workflowVersion);
  if (!planningMilestones.length) return [];

  // Filter selected or required output documents
  const selectedDocs = outputDocs.filter((doc) => (doc.isSelected || doc.isRequired) && planningMilestones.some(m => m.id === doc.milestoneId));

  if (selectedDocs.length > 0) {
    const rows: TimelineDraftRow[] = [];
    let step = 1;

    // Each output owns its schedule; its parent retains the workflow status.
    for (const doc of selectedDocs) {
      const parentMilestone = planningMilestones.find((m) => m.id === doc.milestoneId)
        || planningMilestones.find((m) => m.workflow_stage?.default_role === "SA");
      const startDate = doc.startDate || parentMilestone?.start_date || "";
      const durationWorkingDays = String(doc.durationWorkingDays ?? parentMilestone?.duration_working_days ?? "");

      rows.push({
        rowId: `doc-${doc.key}`,
        milestoneId: doc.milestoneId || parentMilestone?.id || "",
        documentKey: doc.key,
        outputDocumentId: doc.id,
        stepOrder: step++,
        name: translateOutputName(doc.key, doc.name),
        role: "SA",
        isRequired: doc.isRequired,
        startDate,
        durationWorkingDays,
        savedStartDate: startDate,
        savedDurationWorkingDays: durationWorkingDays,
        dueDate: doc.dueDate || parentMilestone?.due_date || null,
      });
    }

    // Milestones that do not represent SA output documents (e.g. SALES "Tender Process")
    const otherMilestones = planningMilestones.filter(
      (m) => m.workflow_stage?.default_role !== "SA"
    );

    for (const milestone of otherMilestones) {
      const startDate = milestone.start_date || "";
      const durationWorkingDays = String(milestone.duration_working_days ?? "");

      rows.push({
        rowId: `ms-${milestone.id}`,
        milestoneId: milestone.id,
        stepOrder: step++,
        name: milestone.name,
        role: milestone.workflow_stage?.default_role || "-",
        isRequired: true,
        startDate,
        durationWorkingDays,
        savedStartDate: startDate,
        savedDurationWorkingDays: durationWorkingDays,
        dueDate: milestone.due_date || null,
      });
    }

    return rows;
  }

  // Fallback if output documents have not loaded or none exist
  return planningMilestones.map((milestone, idx) => ({
    rowId: `ms-${milestone.id}`,
    milestoneId: milestone.id,
    stepOrder: idx + 1,
    name: milestone.name,
    role: milestone.workflow_stage?.default_role || "-",
    startDate: milestone.start_date || "",
    durationWorkingDays: milestone.duration_working_days ? String(milestone.duration_working_days) : "",
    savedStartDate: milestone.start_date || "",
    savedDurationWorkingDays: milestone.duration_working_days ? String(milestone.duration_working_days) : "",
    dueDate: milestone.due_date || null,
  }));
};

