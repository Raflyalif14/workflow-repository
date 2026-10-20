"use client";
import { RoleGuard } from '@/components/auth/role-guard';
import { CameraPreparation } from '@/components/settings/camera-preparation';
export default function AdvancedFacePage() {
  return <RoleGuard allowedRoles={['SALES', 'SA', 'HEAD_SA', 'SUPER_ADMIN']}><CameraPreparation /></RoleGuard>;
}
