"use client";

import { History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAssignmentHistory } from "@/hooks/use-projects";

export function AssignmentHistoryCard({ projectId }: { projectId: string }) {
  const { data: history = [], isLoading } = useAssignmentHistory(projectId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <History className="h-4 w-4 text-primary" />
        <CardTitle className="text-base">Assignment History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading assignment history...</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assignments recorded yet.</p>
        ) : (
          history.map((item) => (
            <div key={item.id} className="border-b border-border/40 pb-3 text-sm last:border-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{item.pic?.full_name || item.pic?.fullName || "Unknown PIC"}</p>
                <Badge variant="outline">{item.assignment_type === "REASSIGNMENT" ? "Reassigned" : "Assigned"}</Badge>
              </div>
              {item.previous_pic && (
                <p className="mt-1 text-xs text-muted-foreground">
                  From {item.previous_pic.full_name || item.previous_pic.fullName} to {item.pic?.full_name || item.pic?.fullName}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Assigned by {item.assigned_by?.full_name || item.assigned_by?.fullName || "-"}
              </p>
              <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
              {item.reason && <p className="mt-2 text-xs">Reason: {item.reason}</p>}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
