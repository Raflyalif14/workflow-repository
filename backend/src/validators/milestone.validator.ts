import { z } from 'zod';

export const submitMilestoneSchema = z.object({
  note: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().optional()
  ),
});

export type SubmitMilestoneInput = z.infer<typeof submitMilestoneSchema>;
