import { z } from 'zod';
import { selectedDocumentKeysSchema } from './project-management.validator';

const outputDocumentBatchItemSchema = z.object({
  document_key: z.string().trim().min(1).max(100),
  expected_version_id: z.string().uuid(),
  request_id: z.string().uuid(),
  file_revisions: z.array(z.object({
    file_id: z.string().uuid(),
    feedback: z.string().trim().min(1).max(2000),
  }).strict()).max(10).optional(),
});

const revisionSchema = z.union([z.number(), z.string().regex(/^\d+$/)])
  .pipe(z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER));

export const uploadOutputDocumentFileSchema = z.object({
  expected_draft_revision: revisionSchema,
  request_id: z.string().uuid(),
  replace_file_id: z.string().uuid().optional(),
});

export const removeOutputDocumentFileSchema = z.object({
  expected_draft_revision: revisionSchema,
  request_id: z.string().uuid(),
});

const submitOutputDocumentItemSchema = z.object({
  document_key: z.string().trim().min(1).max(100),
  expected_draft_revision: revisionSchema,
  request_id: z.string().uuid(),
});

export const submitOutputDocumentsSchema = z.object({
  items: z.array(submitOutputDocumentItemSchema).min(1).max(50),
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
  if (value.decision !== 'APPROVE' && !value.items[0]?.file_revisions?.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['items', 0, 'file_revisions'],
      message: 'Select at least one snapshot file and provide its revision feedback.',
    });
  }
  for (const [index, item] of value.items.entries()) {
    const markers = item.file_revisions || [];
    if (new Set(markers.map(marker => marker.file_id)).size !== markers.length
      || (value.decision === 'APPROVE' && markers.length > 0)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['items', index, 'file_revisions'], message: 'Invalid file revision selection.' });
    }
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
export type UploadOutputDocumentFileInput = z.infer<typeof uploadOutputDocumentFileSchema>;
export type RemoveOutputDocumentFileInput = z.infer<typeof removeOutputDocumentFileSchema>;
