import type { ProjectStatus } from '@/types/project';

export const PROJECT_DELIVERY_COMPLETED_STATUSES = ['COMPLETED', 'WAITING_RESULT', 'WON', 'LOST'] as const;

export function isProjectDeliveryCompleted(status: ProjectStatus): boolean {
  return PROJECT_DELIVERY_COMPLETED_STATUSES.some(value => value === status);
}
