import { z } from 'zod';

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must use YYYY-MM-DD format').refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}, 'startDate must be a valid date');

const timelineEntrySchema = z.object({
  milestoneId: z.string().uuid(),
  startDate: dateOnlySchema,
  durationWorkingDays: z.coerce.number().int().positive(),
});

const timelineEntriesSchema = z.array(timelineEntrySchema).min(1).superRefine((entries, context) => {
  const ids = new Set<string>();

  entries.forEach((entry, index) => {
    if (ids.has(entry.milestoneId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'milestoneId'],
        message: 'Each milestone can appear only once in a timeline request',
      });
    }
    ids.add(entry.milestoneId);
  });
});

export const saveProjectTimelineSchema = z.union([
  z.object({ milestones: timelineEntriesSchema }),
  timelineEntriesSchema,
]).transform((input) => Array.isArray(input) ? { milestones: input } : input);

export const submitProjectPlanSchema = z.object({
  request_note: z.string().trim().max(2000).optional(),
});

export const approveProjectPlanSchema = z.object({
  note: z.string().trim().max(2000).optional(),
  pic_id: z.string().uuid().optional(),
});

export const rejectProjectPlanSchema = z.object({
  note: z.string().trim().min(1, 'note is required').max(2000),
});

export type SaveProjectTimelineInput = z.infer<typeof saveProjectTimelineSchema>;
export type SubmitProjectPlanInput = z.infer<typeof submitProjectPlanSchema>;
export type ApproveProjectPlanInput = z.infer<typeof approveProjectPlanSchema>;
export type RejectProjectPlanInput = z.infer<typeof rejectProjectPlanSchema>;
