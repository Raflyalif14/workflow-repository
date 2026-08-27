import { z } from 'zod';

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start_date must use YYYY-MM-DD format').refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}, 'start_date must be a valid date');

export const calculateDeadlineSchema = z.object({
  start_date: dateOnlySchema,
  duration_working_days: z.number().int().positive(),
});

export const saveMilestoneDeadlineSchema = calculateDeadlineSchema.extend({
  reason: z.string().trim().min(1).optional(),
});

export type CalculateDeadlineInput = z.infer<typeof calculateDeadlineSchema>;
export type SaveMilestoneDeadlineInput = z.infer<typeof saveMilestoneDeadlineSchema>;
