import { z } from 'zod';

const optionalNoteSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional()
);

export const approveDeadlineApprovalSchema = z.object({
  note: optionalNoteSchema,
});

export const rejectDeadlineApprovalSchema = z.object({
  note: z.string().trim().min(1, 'note is required'),
});

export type ApproveDeadlineApprovalInput = z.infer<typeof approveDeadlineApprovalSchema>;
export type RejectDeadlineApprovalInput = z.infer<typeof rejectDeadlineApprovalSchema>;
