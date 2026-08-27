import { z } from 'zod';

export const submitMilestoneSchema = z.object({
  notes: z.string().optional(),
});

export const approveMilestoneSchema = z.object({
  feedback: z.string().optional(),
});

export const rejectMilestoneSchema = z.object({
  feedback: z.string().min(5, 'Rejection feedback is required (min 5 characters)'),
});

export const assignPicSchema = z.object({
  picId: z.string().uuid('Valid Solution Architect PIC user ID is required'),
  applyToSubsequent: z.boolean().default(true), // Also assign to future milestones
});

export type SubmitMilestoneInput = z.infer<typeof submitMilestoneSchema>;
export type ApproveMilestoneInput = z.infer<typeof approveMilestoneSchema>;
export type RejectMilestoneInput = z.infer<typeof rejectMilestoneSchema>;
export type AssignPicInput = z.infer<typeof assignPicSchema>;
