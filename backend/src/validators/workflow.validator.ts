import { z } from 'zod';

export const createWorkflowSchema = z.object({
  name: z.string().min(2, 'Workflow name must be at least 2 characters'),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Slug must be lower-case and alphanumeric with hyphens'),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
  repositoryId: z.string().uuid('Invalid repository ID format'),
});

export const createWorkflowVersionSchema = z.object({
  workflowId: z.string().uuid('Invalid workflow ID'),
  versionNumber: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must follow SemVer format e.g. 1.0.0'),
  changelog: z.string().optional(),
  triggerType: z.enum(['MANUAL', 'SCHEDULED', 'WEBHOOK', 'EVENT_DRIVEN', 'PIPELINE_TRIGGER']).default('MANUAL'),
  definitionJson: z.record(z.any()),
});

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type CreateWorkflowVersionInput = z.infer<typeof createWorkflowVersionSchema>;
