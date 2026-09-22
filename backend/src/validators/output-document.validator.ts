import { z } from 'zod';
import { selectedDocumentKeysSchema } from './project-management.validator';

const outputDocumentBatchItemSchema = z.object({
  document_key: z.string().trim().min(1).max(100),
  expected_version_id: z.string().uuid(),
});

export const submitOutputDocumentsSchema = z.object({
  items: z.array(outputDocumentBatchItemSchema).min(1).max(50),
  note: z.string().trim().max(1000).optional(),
}).superRefine((value, context) => {
  if (new Set(value.items.map((item) => item.document_key)).size !== value.items.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'Duplicate output document keys are not allowed.' });
  }
});

export const reviewOutputDocumentsSchema = z.object({
  decision: z.enum(['APPROVE', 'REVISE', 'REJECT']),
  feedback: z.string().trim().max(2000).optional(),
  items: z.array(outputDocumentBatchItemSchema).min(1).max(50),
}).superRefine((value, context) => {
  if (value.decision !== 'APPROVE' && !value.feedback) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['feedback'],
      message: 'Revision feedback is required.',
    });
  }
  if (value.decision !== 'APPROVE' && value.items.length !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'Revision must target exactly one output document.' });
  }
  if (new Set(value.items.map((item) => item.document_key)).size !== value.items.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'Duplicate output document keys are not allowed.' });
  }
});

export const updateOutputChecklistSchema = z.object({
  selectedDocumentKeys: selectedDocumentKeysSchema,
  selected_document_keys: selectedDocumentKeysSchema,
}).refine(
  (value) => value.selectedDocumentKeys !== undefined || value.selected_document_keys !== undefined,
  { message: 'Selected document keys are required.' }
);

export type SubmitOutputDocumentsInput = z.infer<typeof submitOutputDocumentsSchema>;
export type ReviewOutputDocumentsInput = z.infer<typeof reviewOutputDocumentsSchema>;
export type UpdateOutputChecklistInput = z.infer<typeof updateOutputChecklistSchema>;
