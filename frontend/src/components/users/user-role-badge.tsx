import { Briefcase, Code2, Layers, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { translate as translateI18n } from "@/i18n";
import type { UserRole } from "@/types/user";

export function UserRoleBadge({ role }: { role: UserRole }) {
  switch (role) {
    case "SUPER_ADMIN":
      return (
        <Badge className="bg-primary-soft text-primary border border-primary/20 gap-1 font-medium">
          <Shield className="h-3 w-3" />
          <span>{translateI18n("role.SUPER_ADMIN")}</span>
        </Badge>
      );
    case "SALES":
      return (
        <Badge className="bg-blue-500/15 text-primary border border-blue-500/30 gap-1 font-medium">
          <Briefcase className="h-3 w-3" />
          <span>{translateI18n("role.SALES")}</span>
        </Badge>
      );
    case "HEAD_SA":
      return (
        <Badge className="bg-amber-500/15 text-warning border border-amber-500/30 gap-1 font-medium">
          <Layers className="h-3 w-3" />
          <span>{translateI18n("role.HEAD_SA")}</span>
        </Badge>
      );
    case "SA":
      return (
        <Badge className="bg-emerald-500/15 text-success border border-emerald-500/30 gap-1 font-medium">
          <Code2 className="h-3 w-3" />
          <span>{translateI18n("role.SA")}</span>
        </Badge>
      );
    default:
      return <Badge variant="outline">{role}</Badge>;
  }
}
