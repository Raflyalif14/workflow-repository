import { isMilestoneCompleted } from "./milestone-ui-state";
import type { ProjectMilestonePhase4 } from "@/types/project";

export function calculateProjectMilestoneProgress(milestones: readonly Pick<ProjectMilestonePhase4, "status">[]) {
  const completed = milestones.filter(isMilestoneCompleted).length;
  const total = milestones.length;
  return { completed, total, percentage: total ? Math.round((completed / total) * 100) : 0 };
}
