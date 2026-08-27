import { z } from 'zod';
import { userRoleEnum } from './auth.validator';

export const createScenarioSchema = z.object({ name: z.string().trim().min(2), description: z.string().trim().optional() });
export const updateScenarioSchema = z.object({ name: z.string().trim().min(2).optional(), description: z.string().trim().nullable().optional() });
export const scenarioStatusSchema = z.object({ is_active: z.boolean() });
export const scenarioQuerySchema = z.object({ is_active: z.enum(['true', 'false']).optional(), search: z.string().trim().optional() });
export const createStageSchema = z.object({
  name: z.string().trim().min(2),
  description: z.string().trim().optional(),
  step_order: z.number().int().positive().optional(),
  default_role: userRoleEnum,
  default_duration_working_days: z.number().int().nonnegative().default(0),
  is_required: z.boolean().default(true),
});
export const updateStageSchema = z.object({
  name: z.string().trim().min(2).optional(), description: z.string().trim().nullable().optional(),
  default_role: userRoleEnum.optional(), default_duration_working_days: z.number().int().nonnegative().optional(),
  is_required: z.boolean().optional(), is_active: z.boolean().optional(),
});
export const reorderSchema = z.object({ stages: z.array(z.object({ id: z.string().uuid(), step_order: z.number().int().positive() })).min(1) });
export type CreateScenarioInput = z.infer<typeof createScenarioSchema>;
export type UpdateScenarioInput = z.infer<typeof updateScenarioSchema>;
export type CreateStageInput = z.infer<typeof createStageSchema>;
export type UpdateStageInput = z.infer<typeof updateStageSchema>;
