import {
  DashboardWorkItem,
  DashboardProjectHealth,
  buildDashboardDistribution,
  formatDashboardActivityLabel,
  formatDashboardDate,
  formatDashboardDeadline,
  formatDashboardLabel,
  formatDashboardTimestamp,
  getAdditionalDashboardItems,
  getApprovalProjectHref,
  getDashboardGreeting,
  getDashboardGreetingSubject,
  getDashboardInsights,
  getDashboardKpiLabels,
  getDashboardRoleContent,
  getDraftProjectActionCopy,
  getDashboardProjectHealthLabel,
  getDashboardQueueTitle,
  getDashboardSnapshotTitle,
  getHeadSaOutputReviewItems,
  getMilestoneProjectHref,
  getOutputDocumentsHref,
  getSalesDashboardItems,
  getSaOutputRevisionItems,
  hasAdditionalDashboardItems,
  isDashboardAction,
  sortDashboardItems,
  sortDashboardProjectHealth,
  sortSaWorkload,
  shouldShowSaWorkload,
  shouldShowDashboardInsights,
} from "./dashboard-ux";
import type { Project } from "@/types/project";
import type { DashboardSaWorkload } from "@/types/dashboard";

const roleCases: Array<[string | undefined, string]> = [
  ["SALES", "Sales workspace"],
  ["HEAD_SA", "Review workspace"],
  ["SA", "Delivery workspace"],
  ["SUPER_ADMIN", "Operations overview"],
  ["UNKNOWN", "Workspace"],
  [undefined, "Workspace"],
];

for (const [role, expectedTitle] of roleCases) {
  if (getDashboardRoleContent(role).title !== expectedTitle) {
    throw new Error(`Unexpected dashboard title for ${role || "undefined"}`);
  }
}

const greetingCases: Array<[number, string]> = [
  [0, "Good morning"],
  [11, "Good morning"],
  [12, "Good afternoon"],
  [17, "Good afternoon"],
  [18, "Good evening"],
  [23, "Good evening"],
  [-1, "Hello"],
];

for (const [hour, expectedGreeting] of greetingCases) {
  if (getDashboardGreeting(hour) !== expectedGreeting) {
    throw new Error(`Unexpected dashboard greeting for hour ${hour}`);
  }
}

const greetingSubjectCases: Array<[string | undefined, string | undefined, string]> = [
  ["Senja Pratama", "HEAD_SA", "Senja"],
  ["Head Solution Architect", "HEAD_SA", "Head SA"],
  ["Sales Test", "SALES", "Sales"],
  [undefined, "SA", "Solution Architect"],
  [undefined, "OPERATIONS_LEAD", "Operations Lead"],
];

for (const [displayName, role, expectedSubject] of greetingSubjectCases) {
  if (getDashboardGreetingSubject(displayName, role) !== expectedSubject) {
    throw new Error(`Unexpected dashboard greeting subject for ${displayName || role || "missing user"}`);
  }
}

if (getDashboardKpiLabels("HEAD_SA").join(",") !== "Assigned architects,Active delivery,Work submissions,Unassigned projects") {
  throw new Error("Head SA KPI labels should describe SA workload and current delivery status");
}

if (getDashboardKpiLabels("SALES").join(",") !== "Total estimated revenue,Waiting result,Won,Lost") {
  throw new Error("Sales KPI labels should describe commercial results and revenue");
}

if (getDashboardKpiLabels("SA").join(",") !== "In progress,Needs revision,Upcoming deadlines,Overdue") {
  throw new Error("SA KPI labels should prioritize assigned deadlines");
}

if (getDashboardKpiLabels("SUPER_ADMIN").join(",") !== "Active projects,Overdue milestones,Pending reviews,Completed projects") {
  throw new Error("Super Admin KPI labels should describe portfolio operations");
}

const unsorted: DashboardWorkItem[] = [
  { id: "planning", priority: 40, group: "action", label: "Planning", title: "Planning", description: "", href: "/projects/1", actionLabel: "Open" },
  { id: "revision", priority: 10, group: "action", label: "Revision", title: "Revision", description: "", href: "/projects/1", actionLabel: "Open" },
  { id: "review", priority: 20, group: "action", label: "Review", title: "Review", description: "", href: "/projects/1", actionLabel: "Open" },
];

if (sortDashboardItems(unsorted).map((item) => item.id).join(",") !== "revision,review,planning") {
  throw new Error("Dashboard items should retain urgency priority ordering");
}

if (getAdditionalDashboardItems(unsorted).some((item) => item.id === "revision")) {
  throw new Error("The next task must not reappear in the additional queue");
}

const dashboardInsights = getDashboardInsights(unsorted, "revision");
if (dashboardInsights.some((item) => item.id === "revision")) {
  throw new Error("The header next task must not be duplicated in Quick insights");
}

if (hasAdditionalDashboardItems([unsorted[0]])) {
  throw new Error("A single task should not render an additional-work section");
}

if (getApprovalProjectHref("project-1", "PROJECT_PLAN", "milestone-1") !== "/projects/project-1#project-plan-review") {
  throw new Error("Project plan approvals should open the plan review section");
}

if (getApprovalProjectHref("project-1", "SUBMISSION", "milestone-1") !== "/projects/project-1#project-milestone-milestone-1") {
  throw new Error("Milestone approvals should open the matching milestone");
}

if (getApprovalProjectHref("project-1", "DEADLINE") !== "/projects/project-1") {
  throw new Error("Approval links without a milestone should safely fall back to Project Detail");
}

if (getMilestoneProjectHref("project-1", "milestone-1") !== "/projects/project-1#project-milestone-milestone-1") {
  throw new Error("Assigned milestones should open the matching Project Detail milestone");
}

if (getOutputDocumentsHref("project-1") !== "/projects/project-1#output-documents") {
  throw new Error("Output document dashboard links should target the existing Project Detail anchor");
}

const headSaOutputItems = getHeadSaOutputReviewItems([{ projectId: "project-output", projectName: "Output Review", count: 2 }]);
if (headSaOutputItems.length !== 1 || headSaOutputItems[0].href !== "/projects/project-output#output-documents" || headSaOutputItems[0].label !== "Output documents awaiting review") {
  throw new Error("Head SA should receive one project-grouped output review task");
}

const saOutputItems = getSaOutputRevisionItems([{ projectId: "project-output", projectName: "Output Revision", count: 1 }]);
if (saOutputItems.length !== 1 || saOutputItems[0].priority >= 10 || saOutputItems[0].href !== "/projects/project-output#output-documents") {
  throw new Error("Assigned SA output revisions should be a high-priority direct task");
}

if (getDraftProjectActionCopy("SALES") !== "Continue project planning") {
  throw new Error("Sales draft projects should use safe planning copy");
}

if (/ready/i.test(getDraftProjectActionCopy("SALES"))) {
  throw new Error("Draft projects must not be described as ready for submission without evidence");
}

const salesMilestoneProject: Project = {
  id: "project-sales-stage",
  name: "Commercial Delivery",
  customer: "Customer One",
  sales_id: "sales-owner",
  status: "ACTIVE",
  is_postponed: false,
  currentMilestone: {
    id: "milestone-commercial",
    name: "Commercial Negotiation",
    step_order: 6,
    status: "IN_PROGRESS",
    default_role: "SALES",
  },
  createdAt: "2026-09-16T00:00:00.000Z",
  updatedAt: "2026-09-16T00:00:00.000Z",
};

const salesMilestoneItems = getSalesDashboardItems([salesMilestoneProject], "sales-owner");
if (
  salesMilestoneItems.length !== 1 ||
  salesMilestoneItems[0].href !== "/projects/project-sales-stage#project-milestone-milestone-commercial" ||
  salesMilestoneItems[0].group !== "action"
) {
  throw new Error("The owning Sales user should receive a direct actionable item for an active Sales-role milestone");
}

if (getSalesDashboardItems([salesMilestoneProject], "other-sales").length !== 0) {
  throw new Error("An unrelated Sales user must not receive another owner's milestone task");
}

const waitingResultProject: Project = {
  ...salesMilestoneProject,
  id: "project-waiting-result",
  status: "WAITING_RESULT",
  currentMilestone: null,
};
const waitingResultItems = getSalesDashboardItems([waitingResultProject], "sales-owner");
if (
  waitingResultItems.length !== 1 ||
  waitingResultItems[0].id !== "sales-result-project-waiting-result" ||
  waitingResultItems[0].actionLabel !== "Record result"
) {
  throw new Error("Sales should receive one direct action to record a completed project's result");
}

const duplicateSalesItems = getSalesDashboardItems(
  [salesMilestoneProject, salesMilestoneProject],
  "sales-owner"
);
if (duplicateSalesItems.length !== 1) {
  throw new Error("A Sales milestone must not be duplicated in the dashboard queue");
}

for (const status of ["CREATED", "COMPLETED", "SUBMITTED"] as const) {
  const inactiveItems = getSalesDashboardItems(
    [{ ...salesMilestoneProject, currentMilestone: { ...salesMilestoneProject.currentMilestone!, status } }],
    "sales-owner"
  );
  if (inactiveItems.some((item) => item.id === "sales-milestone-milestone-commercial")) {
    throw new Error(`A ${status} Sales milestone must not be an actionable dashboard task`);
  }
}

const postponedSalesItems = getSalesDashboardItems(
  [{ ...salesMilestoneProject, status: "POSTPONED", is_postponed: true }],
  "sales-owner"
);
if (postponedSalesItems.some((item) => item.id === "sales-milestone-milestone-commercial")) {
  throw new Error("A Sales milestone must not remain actionable while its project is postponed");
}
if (postponedSalesItems.some((item) => item.group === "action")) {
  throw new Error("A postponed project must not become a Sales next task");
}

const prioritizedSalesItems = sortDashboardItems([
  ...salesMilestoneItems,
  ...getSalesDashboardItems(
    [{
      id: "draft-project",
      name: "Draft",
      customer: "Customer Two",
      sales_id: "sales-owner",
      status: "DRAFT",
      currentRole: "SALES",
      createdAt: "2026-09-16T00:00:00.000Z",
      updatedAt: "2026-09-16T00:00:00.000Z",
    }],
    "sales-owner"
  ),
]);
if (prioritizedSalesItems[0]?.id !== "sales-milestone-milestone-commercial") {
  throw new Error("An active Sales milestone should be prioritized ahead of routine project planning");
}

const waitingItem: DashboardWorkItem = {
  id: "waiting",
  priority: 20,
  group: "waiting",
  label: "Under review",
  title: "Project plan",
  description: "Head SA is reviewing the plan.",
};

if (isDashboardAction(waitingItem)) {
  throw new Error("Waiting items must not become primary actions");
}

const waitingInsight = getDashboardInsights([waitingItem])[0];
if (waitingInsight.tone !== "waiting" || waitingInsight.isPrimaryAction) {
  throw new Error("Waiting work should remain a non-primary insight");
}

const revisionInsight = getDashboardInsights([unsorted[1]])[0];
if (revisionInsight.tone !== "risk" || !revisionInsight.isPrimaryAction) {
  throw new Error("Revision work should be classified as a real actionable risk insight");
}

if (formatDashboardLabel("PENDING_REVIEW") !== "Pending Review") {
  throw new Error("Dashboard labels must not expose raw underscore values");
}

if (formatDashboardLabel("FUTURE_STATE") !== "Future State") {
  throw new Error("Unknown dashboard states should have a safe human-readable fallback");
}

if (getDashboardSnapshotTitle("HEAD_SA") !== "Review snapshot" || getDashboardQueueTitle("SA") !== "Assigned work") {
  throw new Error("Dashboard section titles should remain role-specific");
}

const healthProjects: DashboardProjectHealth[] = [
  {
    id: "active",
    name: "Active project",
    status: "ACTIVE",
    percentage: 60,
    completedMilestones: 3,
    totalMilestones: 5,
    overdueMilestones: 0,
  },
  {
    id: "overdue",
    name: "Overdue project",
    status: "ACTIVE",
    percentage: 40,
    completedMilestones: 2,
    totalMilestones: 5,
    overdueMilestones: 1,
  },
];

if (sortDashboardProjectHealth(healthProjects, "HEAD_SA")[0].id !== "overdue") {
  throw new Error("Overdue projects should be prioritized in delivery health");
}

if (getDashboardProjectHealthLabel(healthProjects[0], "HEAD_SA") !== "On track") {
  throw new Error("Active projects without exceptions should be presented as on track");
}

if (getDashboardProjectHealthLabel({ ...healthProjects[0], percentage: null }, "HEAD_SA") !== "Active") {
  throw new Error("Unknown project progress must not be presented as confirmed healthy");
}

if (formatDashboardActivityLabel("MILESTONE_SUBMITTED") !== "Work Submitted" || /_/.test(formatDashboardActivityLabel("FUTURE_ACTIVITY"))) {
  throw new Error("Activity labels must not expose raw underscore action values");
}

if (formatDashboardDate(undefined) !== null || formatDashboardDate("not-a-date") !== null) {
  throw new Error("Missing or invalid dashboard dates should be safely omitted");
}

if (formatDashboardDeadline(undefined) !== null || formatDashboardDeadline("2026-02-30") !== null) {
  throw new Error("Missing or invalid workload deadlines should be safely omitted");
}

const saWorkload: DashboardSaWorkload[] = [
  { saId: "idle", saName: "Zero", activeProjectCount: 0, activeMilestoneCount: 0, overdueCount: 0, revisionCount: 0, waitingReviewCount: 0, nearestDeadline: null },
  { saId: "later", saName: "Later", activeProjectCount: 1, activeMilestoneCount: 1, overdueCount: 0, revisionCount: 0, waitingReviewCount: 0, nearestDeadline: "2026-09-25" },
  { saId: "revision", saName: "Revision", activeProjectCount: 1, activeMilestoneCount: 1, overdueCount: 0, revisionCount: 2, waitingReviewCount: 0, nearestDeadline: "2026-09-10" },
  { saId: "overdue", saName: "Overdue", activeProjectCount: 1, activeMilestoneCount: 1, overdueCount: 1, revisionCount: 0, waitingReviewCount: 0, nearestDeadline: "2026-09-30" },
  { saId: "active", saName: "Active", activeProjectCount: 1, activeMilestoneCount: 2, overdueCount: 0, revisionCount: 0, waitingReviewCount: 0, nearestDeadline: "2026-09-28" },
  { saId: "soon", saName: "Soon", activeProjectCount: 1, activeMilestoneCount: 1, overdueCount: 0, revisionCount: 0, waitingReviewCount: 0, nearestDeadline: "2026-09-20" },
];

if (sortSaWorkload(saWorkload).map((item) => item.saId).join(",") !== "overdue,revision,active,soon,later,idle") {
  throw new Error("SA workload must sort by overdue, revision, active work, nearest deadline, then name");
}

if (sortSaWorkload([]).length !== 0) {
  throw new Error("An empty SA workload should remain empty");
}

if (!shouldShowSaWorkload("HEAD_SA") || shouldShowSaWorkload("SALES") || shouldShowSaWorkload("SA") || shouldShowSaWorkload("SUPER_ADMIN")) {
  throw new Error("Only Head SA presentation may render team workload");
}

if (formatDashboardTimestamp(undefined) !== null || formatDashboardTimestamp("not-a-date") !== null) {
  throw new Error("Missing or invalid dashboard timestamps should be safely omitted");
}

const distribution = buildDashboardDistribution([
  { label: "Assessment", count: 3 },
  { label: "Existing TOR", count: 1 },
  { label: "Empty", count: 0 },
]);

if (distribution.length !== 2 || distribution[0].label !== "Assessment" || distribution[0].percentage !== 75) {
  throw new Error("Dashboard distributions should remove empty values and retain proportional ordering");
}

if (buildDashboardDistribution([]).length !== 0 || buildDashboardDistribution([{ label: "Empty", count: 0 }]).length !== 0) {
  throw new Error("Empty dashboard distributions should have a safe empty result");
}

if (!shouldShowDashboardInsights("HEAD_SA", 2, 1) || !shouldShowDashboardInsights("SALES", 1, 2)) {
  throw new Error("Portfolio and scoped Sales insights should render when they add more than one category");
}

if (shouldShowDashboardInsights("SA", 2, 2) || shouldShowDashboardInsights("HEAD_SA", 1, 1)) {
  throw new Error("SA and single-category distributions should not render redundant dashboard insights");
}

console.log("Dashboard UX helper tests passed successfully!");
