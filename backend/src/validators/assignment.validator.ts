import { z } from 'zod';

export const assignPicSchema = z.object({
  newPicId: z.string().uuid('Valid Solution Architect User ID is required'),
  milestoneId: z.string().uuid().optional(),
  assignToAllFuture: z.boolean().default(true),
  reason: z.string().optional(),
});

export type AssignPicInput = z.infer<typeof assignPicSchema>;
