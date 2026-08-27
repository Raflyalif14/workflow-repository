import { z } from 'zod';

const optionalNoteSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional()
);

export const requestMilestoneInitiationApprovalSchema = z.object({
  note: optionalNoteSchema,
});

export const approveMilestoneInitiationApprovalSchema = z.object({
  note: optionalNoteSchema,
});

export const rejectMilestoneInitiationApprovalSchema = z.object({
  note: z.string().trim().min(1, 'note is required'),
});

export type RequestMilestoneInitiationApprovalInput = z.infer<typeof requestMilestoneInitiationApprovalSchema>;
export type ApproveMilestoneInitiationApprovalInput = z.infer<typeof approveMilestoneInitiationApprovalSchema>;
export type RejectMilestoneInitiationApprovalInput = z.infer<typeof rejectMilestoneInitiationApprovalSchema>;
