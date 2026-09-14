import {
  DashboardWorkItem,
  DashboardProjectHealth,
  buildDashboardDistribution,
  formatDashboardActivityLabel,
  formatDashboardDate,
  formatDashboardLabel,
  formatDashboardTimestamp,
  getAdditionalDashboardItems,
  getApprovalProjectHref,
  getDashboardGreeting,
  getDashboardInsights,
  getDashboardKpiLabels,
  getDashboardRoleContent,
  getDraftProjectActionCopy,
  getDashboardProjectHealthLabel,
  getDashboardQueueTitle,
  getDashboardSnapshotTitle,
  getMilestoneProjectHref,
  hasAdditionalDashboardItems,
  isDashboardAction,
  sortDashboardItems,
  sortDashboardProjectHealth,
  shouldShowDashboardInsights,
} from "./dashboard-ux";

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

if (getDashboardKpiLabels("HEAD_SA").join(",") !== "Plans to review,Work submissions,Deadline requests,Unassigned projects") {
  throw new Error("Head SA KPI labels should describe the real review workload");
}

if (getDashboardKpiLabels("SALES").join(",") !== "Planning,Waiting for review,Active projects,Postponed") {
  throw new Error("Sales KPI labels should describe the real project pipeline");
}

if (getDashboardKpiLabels("SA").join(",") !== "In progress,Needs revision,Waiting for review,Completed") {
  throw new Error("SA KPI labels should describe assigned delivery work");
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

if (getDraftProjectActionCopy("SALES") !== "Continue project planning") {
  throw new Error("Sales draft projects should use safe planning copy");
}

if (/ready/i.test(getDraftProjectActionCopy("SALES"))) {
  throw new Error("Draft projects must not be described as ready for submission without evidence");
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
