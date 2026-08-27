import { z } from 'zod';

const optionalNoteSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional()
);

export const approveMilestoneApprovalSchema = z.object({
  note: optionalNoteSchema,
});

export const rejectMilestoneApprovalSchema = z.object({
  note: z.string().trim().min(1, 'note is required'),
});

export type ApproveMilestoneApprovalInput = z.infer<typeof approveMilestoneApprovalSchema>;
export type RejectMilestoneApprovalInput = z.infer<typeof rejectMilestoneApprovalSchema>;
