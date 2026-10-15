"use client";
import Link from 'next/link';
import { RoleGuard } from '@/components/auth/role-guard';
import { FacePassiveTest } from '@/components/settings/face-passive-test';
import { useLanguage } from '@/components/i18n/language-provider';

export default function FacePassivePage() {
  const { t } = useLanguage();
  return <RoleGuard allowedRoles={['SALES','SA','HEAD_SA','SUPER_ADMIN']}>
    <div className="container max-w-3xl space-y-5 py-6">
      <Link href="/settings/face-verification" className="text-sm text-primary">← {t('faceVerification.title')}</Link>
      <FacePassiveTest />
    </div>
  </RoleGuard>;
}
