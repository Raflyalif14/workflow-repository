import { z } from 'zod';

const parseDocumentKeys = (val: unknown): string[] | undefined => {
  if (val === undefined || val === null || val === '') return undefined;
  if (Array.isArray(val)) return val.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String).map((s) => s.trim()).filter(Boolean);
    } catch {
      return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return undefined;
};

export const selectedDocumentKeysSchema = z.preprocess(parseDocumentKeys, z.array(z.string()).optional());

export const projectManagementStatusEnum = z.enum([
  'DRAFT',
  'ACTIVE',
  'POSTPONED',
  'COMPLETED',
  'CANCELLED',
  'WAITING_RESULT',
  'WON',
  'LOST',
]);
export const createProjectManagementSchema = z.object({
  name: z.string().trim().min(2),
  customer: z.string().trim().min(2),
  scenario_id: z.string().uuid(),
  estimated_revenue: z.coerce.number().finite().nonnegative(),
  selectedDocumentKeys: selectedDocumentKeysSchema,
  selected_document_keys: selectedDocumentKeysSchema,
});
export const updateProjectManagementSchema = z.object({
  name: z.string().trim().min(2).optional(),
  customer: z.string().trim().min(2).optional(),
  scenario_id: z.string().uuid().optional(),
  estimated_revenue: z.coerce.number().finite().nonnegative().optional(),
  selectedDocumentKeys: selectedDocumentKeysSchema,
  selected_document_keys: selectedDocumentKeysSchema,
});
export const postponeManagementSchema = z.object({ reason: z.string().trim().min(1) });
export const projectOutcomeSchema = z.object({
  outcome: z.enum(['WON', 'LOST']),
  final_contract_value: z.coerce.number().finite().positive().optional(),
  loss_reason: z.string().trim().min(1).max(2000).optional(),
}).superRefine((value, context) => {
  if (value.outcome === 'WON' && value.final_contract_value === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['final_contract_value'], message: 'Final contract value is required for WON.' });
  }
  if (value.outcome === 'LOST' && !value.loss_reason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['loss_reason'], message: 'Loss reason is required for LOST.' });
  }
  if (value.outcome === 'WON' && value.loss_reason !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['loss_reason'], message: 'Loss reason is only allowed for LOST.' });
  }
  if (value.outcome === 'LOST' && value.final_contract_value !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['final_contract_value'], message: 'Final contract value is only allowed for WON.' });
  }
});
export const projectQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(10), search: z.string().trim().optional(), scenario_id: z.string().uuid().optional(), status: projectManagementStatusEnum.optional(), sales_id: z.string().uuid().optional() });
export type CreateProjectManagementInput = z.infer<typeof createProjectManagementSchema>;
export type UpdateProjectManagementInput = z.infer<typeof updateProjectManagementSchema>;
export type ProjectQuery = z.infer<typeof projectQuerySchema>;
export type ProjectOutcomeInput = z.infer<typeof projectOutcomeSchema>;
