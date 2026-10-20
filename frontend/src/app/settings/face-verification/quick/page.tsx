"use client";
import { RoleGuard } from "@/components/auth/role-guard";
import { QuickFaceTest } from "@/components/settings/quick-face-test";

export default function QuickFaceTestPage() {
  return <RoleGuard allowedRoles={["SALES", "SA", "HEAD_SA", "SUPER_ADMIN"]}><QuickFaceTest /></RoleGuard>;
}
