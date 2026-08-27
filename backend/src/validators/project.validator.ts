import { z } from 'zod';

export const projectStatusEnum = z.enum([
  'DRAFT',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
]);

export const milestoneStatusEnum = z.enum([
  'NOT_STARTED',
  'IN_PROGRESS',
  'WAITING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'COMPLETED',
  'OVERDUE',
]);

export const createProjectSchema = z.object({
  projectCode: z
    .string()
    .min(3, 'Project code must be at least 3 characters')
    .max(30, 'Project code cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Alphanumeric, dashes, or underscores only'),
  name: z.string().min(3, 'Project name is required'),
  clientName: z.string().min(2, 'Customer / Client name is required'),
  description: z.string().optional(),
  scenarioId: z.string().uuid('Please select a valid scenario'),
  startDate: z.string().datetime({ message: 'Valid ISO startDate is required' }),
  targetEndDate: z.string().datetime().optional(), // If not provided, computed via Scenario SLA working days
  headSaId: z.string().uuid().optional().nullable(),
  defaultPicId: z.string().uuid().optional().nullable(), // Default Solution Architect assigned
});

export const updateProjectSchema = z.object({
  name: z.string().min(3).optional(),
  clientName: z.string().min(2).optional(),
  description: z.string().optional().nullable(),
  status: projectStatusEnum.optional(),
  headSaId: z.string().uuid().optional().nullable(),
});

export const postponeProjectSchema = z.object({
  newTargetEndDate: z.string().datetime({ message: 'Valid new target end date is required' }),
  reason: z.string().min(5, 'Postpone reason must be at least 5 characters'),
});

export const triggerMilestoneSchema = z.object({
  status: milestoneStatusEnum,
  notes: z.string().optional(),
});

export const listProjectsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  status: projectStatusEnum.optional(),
  scenarioId: z.string().optional(),
  salesId: z.string().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type PostponeProjectInput = z.infer<typeof postponeProjectSchema>;
export type TriggerMilestoneInput = z.infer<typeof triggerMilestoneSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
