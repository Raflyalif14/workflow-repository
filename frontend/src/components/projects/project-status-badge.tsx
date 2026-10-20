"use client";

import { translate as translateI18n } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { formatMilestoneStatusLabel, formatProjectStatusLabel } from "@/lib/workflow-ux-helpers";

export function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "COMPLETED":
    case "APPROVED":
      return <Badge variant="success">{translateI18n("projectStatus.COMPLETED")}</Badge>;
    case "ACTIVE":
      return <Badge variant="default">{translateI18n("common.active")}</Badge>;
    case "IN_PROGRESS":
      return <Badge variant="default">{translateI18n("milestoneStatus.IN_PROGRESS")}</Badge>;
    case "SUBMITTED":
      return <Badge className="border-blue-500/30 bg-blue-500/20 text-primary">{translateI18n("milestoneStatus.UNDER_REVIEW")}</Badge>;
    case "REJECTED":
      return <Badge variant="destructive">{translateI18n("copy.revisionRequired")}</Badge>;
    case "CANCELLED":
      return <Badge variant="destructive">{translateI18n("projectStatus.CANCELLED")}</Badge>;
    case "POSTPONED":
      return <Badge variant="warning">{translateI18n("projectStatus.POSTPONED")}</Badge>;
    case "WAITING_RESULT":
      return <Badge variant="warning">{translateI18n("copy.waitingResult")}</Badge>;
    case "WON":
      return <Badge variant="success">{translateI18n("projectStatus.WON")}</Badge>;
    case "LOST":
      return <Badge variant="destructive">{translateI18n("projectStatus.LOST")}</Badge>;
    case "DRAFT":
      return <Badge variant="outline">{formatProjectStatusLabel(status)}</Badge>;
    case "CREATED":
      return <Badge variant="outline">{formatMilestoneStatusLabel(status)}</Badge>;
    default:
      return <Badge variant="outline">{formatMilestoneStatusLabel(status)}</Badge>;
  }
}
