import { z } from 'zod';

export const documentCategoryEnum = z.enum([
  'PROPOSAL',
  'ARCHITECTURE_DESIGN',
  'SIZING_SHEET',
  'MOM',
  'ASSESSMENT_REPORT',
  'BOQ',
  'DELIVERABLE',
  'OTHER',
]);

export const uploadVersionSchema = z.object({
  changelog: z.string().min(2, 'Changelog / version summary is required'),
});

export const reviewVersionSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  feedback: z.string().optional(),
});

export const createCommentSchema = z.object({
  content: z.string().min(1, 'Comment content cannot be empty'),
  milestoneId: z.string().uuid().optional(),
});

export const listDocumentsQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  milestoneId: z.string().uuid().optional(),
  category: documentCategoryEnum.optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED']).optional(),
  search: z.string().optional(),
});

export type UploadVersionInput = z.infer<typeof uploadVersionSchema>;
export type ReviewVersionInput = z.infer<typeof reviewVersionSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;
