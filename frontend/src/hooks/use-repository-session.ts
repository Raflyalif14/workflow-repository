import { useAuth } from '@/components/auth/auth-provider';
import { getAuthSession } from '@/lib/auth';
import { isCurrentSession } from '@/lib/auth';
import { SessionChangedError } from '@/lib/api-client';

export function useRepositorySession() {
  const { user, isLoading } = useAuth();
  const session = getAuthSession();
  return { user, session, key: [user?.id ?? 'anonymous', session?.id ?? 'none', 'project-sharing-v1', user?.role ?? 'unknown'],
    enabled: !isLoading && Boolean(user?.id && user.isActive && !user.mustChangePassword && session &&
      ['SALES','SA','HEAD_SA','SUPER_ADMIN'].includes(user.role)) };
}

export function requireRepositorySession(scope: ReturnType<typeof useRepositorySession>) {
  if (!scope.enabled || !scope.session || !isCurrentSession(scope.session)) throw new SessionChangedError();
}
