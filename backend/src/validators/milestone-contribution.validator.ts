import { z } from 'zod';

export const createMilestoneContributionSchema = z
  .object({
    note: z.string().trim().max(4000, 'Contribution note must be 4000 characters or fewer.').optional(),
  })
  .strict();

export type CreateMilestoneContributionInput = z.infer<typeof createMilestoneContributionSchema>;
