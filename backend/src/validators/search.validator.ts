import { z } from 'zod';

export const globalSearchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Search query must contain at least 2 characters.').max(100),
});

export type GlobalSearchQuery = z.infer<typeof globalSearchQuerySchema>;
