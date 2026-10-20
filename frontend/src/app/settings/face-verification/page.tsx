"use client";

import { RoleGuard } from "@/components/auth/role-guard";
import { FaceLogin } from "@/components/auth/face-login";
import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";

export default function FaceVerificationPage() {
  const { t } = useLanguage();
  return <RoleGuard allowedRoles={["SALES", "SA", "HEAD_SA", "SUPER_ADMIN"]}>
    <div className="container max-w-3xl space-y-5 py-6">
      <Link href="/settings" className="text-sm text-primary">← {t("nav.settings")}</Link>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t("faceLogin.settingsTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("faceLogin.settingsDescription")}</p>
      </div>
      <FaceLogin enrollment />
    </div>
  </RoleGuard>;
}
