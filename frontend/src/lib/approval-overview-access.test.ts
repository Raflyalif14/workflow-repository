import { canReadApprovalOverview } from "./approval-overview-access";

for (const [role, expected] of [
  ["HEAD_SA", true],
  ["SUPER_ADMIN", true],
  ["SALES", false],
  ["SA", false],
  [undefined, false],
  [null, false],
] as const) {
  if (canReadApprovalOverview(role) !== expected) {
    throw new Error(`Unexpected approval overview eligibility for ${role ?? "no user"}`);
  }
}

console.log("Approval overview role eligibility tests passed.");
