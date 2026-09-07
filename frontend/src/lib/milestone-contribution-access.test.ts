import {
  canAddMilestoneContribution,
  canViewMilestoneContributions,
} from "./milestone-contribution-access";
import { readFileSync } from "fs";
import { join } from "path";

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const project = {
  salesId: "sales-owner",
  status: "ACTIVE",
  isPostponed: false,
  workflowModel: "OPERATIONAL_V2",
  workflowVersion: 2,
};
const firstMilestone = { stepOrder: 1, status: "IN_PROGRESS", picId: "sa-pic" };

assert(
  canAddMilestoneContribution({ id: "sales-owner", role: "SALES" }, project, firstMilestone),
  "Test 1: owning SALES can add input to the active first Operational V2 milestone"
);
assert(
  !canAddMilestoneContribution({ id: "sales-other", role: "SALES" }, project, firstMilestone),
  "Test 2: unrelated SALES cannot add input"
);
assert(
  !canAddMilestoneContribution(
    { id: "sales-owner", role: "SALES" },
    project,
    { ...firstMilestone, stepOrder: 2 }
  ),
  "Test 3: later Operational V2 milestones do not expose collaboration"
);
assert(
  !canAddMilestoneContribution(
    { id: "sales-owner", role: "SALES" },
    { ...project, workflowModel: "LEGACY", workflowVersion: 1 },
    firstMilestone
  ),
  "Test 4: legacy milestones do not expose collaboration"
);
assert(
  canViewMilestoneContributions({ id: "sa-pic", role: "SA" }, project, firstMilestone) &&
    !canViewMilestoneContributions({ id: "sa-other", role: "SA" }, project, firstMilestone),
  "Test 5: only the assigned SA PIC can read supporting input"
);
assert(
  canViewMilestoneContributions({ id: "head-sa", role: "HEAD_SA" }, project, firstMilestone) &&
    canViewMilestoneContributions({ id: "admin", role: "SUPER_ADMIN" }, project, firstMilestone),
  "Test 6: HEAD_SA and SUPER_ADMIN can read supporting input"
);
assert(
  !canAddMilestoneContribution(
    { id: "sales-owner", role: "SALES" },
    { ...project, isPostponed: true },
    firstMilestone
  ) &&
    !canAddMilestoneContribution(
      { id: "sales-owner", role: "SALES" },
      project,
      { ...firstMilestone, status: "COMPLETED" }
    ),
  "Test 7: postponed projects and non-active milestone work cannot receive new input"
);

const projectDetailPage = readFileSync(join(__dirname, "../app/projects/[id]/page.tsx"), "utf8");
assert(
  projectDetailPage.includes(
    'const canSubmit = projectIsActive && stageRole === "SA" && isAssignedPic && milestoneStatus === "IN_PROGRESS";'
  ),
  "Test 8: existing PIC-only Submit Work eligibility must remain unchanged"
);

console.log("Milestone contribution access tests passed.");
