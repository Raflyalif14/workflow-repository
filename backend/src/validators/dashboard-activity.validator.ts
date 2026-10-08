import { z } from 'zod';

export const dashboardActivityQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(500).optional(),
});
