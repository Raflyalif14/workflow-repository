import { z } from 'zod';

export const projectManagementStatusEnum = z.enum(['DRAFT', 'ACTIVE', 'POSTPONED', 'COMPLETED', 'CANCELLED']);
export const createProjectManagementSchema = z.object({ name: z.string().trim().min(2), customer: z.string().trim().min(2), scenario_id: z.string().uuid() });
export const updateProjectManagementSchema = z.object({ name: z.string().trim().min(2).optional(), customer: z.string().trim().min(2).optional(), scenario_id: z.string().uuid().optional() });
export const postponeManagementSchema = z.object({ reason: z.string().trim().min(1) });
export const projectQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(10), search: z.string().trim().optional(), scenario_id: z.string().uuid().optional(), status: projectManagementStatusEnum.optional(), sales_id: z.string().uuid().optional() });
export type CreateProjectManagementInput = z.infer<typeof createProjectManagementSchema>;
export type UpdateProjectManagementInput = z.infer<typeof updateProjectManagementSchema>;
export type ProjectQuery = z.infer<typeof projectQuerySchema>;
