import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/auth-provider';
import { getAuthSession, isCurrentSession } from '@/lib/auth';
import { apiClient, SessionChangedError } from '@/lib/api-client';
import { projectKeys } from '@/lib/query-keys';
import type { DeadlineCalendarData } from '@/types/deadline-calendar';

export function useDeadlineCalendar(month: string) {
  const { user, isLoading } = useAuth();
  const session = getAuthSession();
  const canRead = !isLoading && Boolean(user?.id && user.isActive && !user.mustChangePassword && session
    && ['SALES', 'SA', 'HEAD_SA', 'SUPER_ADMIN'].includes(user.role));
  return useQuery<DeadlineCalendarData>({
    // Existing project/milestone mutations invalidate this prefix.
    queryKey: [...projectKeys.all(), 'deadline-calendar', user?.id, session?.id, user?.role, month],
    enabled: canRead,
    queryFn: async ({ signal }) => {
      if (!canRead || !session || !isCurrentSession(session)) throw new SessionChangedError();
      const data = await apiClient<DeadlineCalendarData>(`/me/deadline-calendar?month=${encodeURIComponent(month)}`, { signal });
      if (!isCurrentSession(session)) throw new SessionChangedError();
      if (data?.month !== month || !Array.isArray(data.items)) throw new Error('Invalid calendar response');
      return data;
    },
    staleTime: 30000,
    refetchOnWindowFocus: true,
    refetchInterval: 60000,
  });
}
