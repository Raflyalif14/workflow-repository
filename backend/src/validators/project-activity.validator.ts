import { z } from 'zod';

export const projectActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().trim().min(1).max(500).optional(),
});

export type ProjectActivityQuery = z.infer<typeof projectActivityQuerySchema>;
