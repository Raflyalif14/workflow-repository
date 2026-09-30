export function canReadApprovalOverview(role?: string | null): boolean {
  return role === "HEAD_SA" || role === "SUPER_ADMIN";
}
