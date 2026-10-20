import { z } from 'zod';

export const dashboardActivityFilterSchema = z.object({
  projectId: z.string().uuid().optional(),
  kind: z.enum(['PROJECT', 'MILESTONE', 'DOCUMENT', 'APPROVAL', 'ASSIGNMENT']).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});
export type DashboardActivityFilters = z.infer<typeof dashboardActivityFilterSchema>;

export const dashboardActivityQuerySchema = dashboardActivityFilterSchema.extend({
  cursor: z.string().trim().min(1).max(500).optional(),
  page: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
}).refine(value => !value.from || !value.to || Date.parse(value.from) < Date.parse(value.to), {
  message: 'Start must precede end.',
}).refine(value => value.cursor === undefined || value.page === undefined, {
  message: 'Use either cursor or page.',
});
