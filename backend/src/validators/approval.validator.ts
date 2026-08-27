import { z } from 'zod';

export const approvalTypeEnum = z.enum(['ALL', 'DEADLINE', 'MILESTONE', 'DOCUMENT']);
export const approvalStatusFilterEnum = z.enum(['ALL', 'PENDING', 'APPROVED', 'REJECTED']);

export const listApprovalsQuerySchema = z.object({
  type: approvalTypeEnum.default('ALL'),
  status: approvalStatusFilterEnum.default('PENDING'),
  projectId: z.string().uuid().optional(),
  search: z.string().optional(),
});

export const processApprovalSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  feedback: z.string().optional(),
});

export const approvalCommentSchema = z.object({
  content: z.string().min(1, 'Comment text cannot be empty'),
});

export type ListApprovalsQuery = z.infer<typeof listApprovalsQuerySchema>;
export type ProcessApprovalInput = z.infer<typeof processApprovalSchema>;
export type ApprovalCommentInput = z.infer<typeof approvalCommentSchema>;
