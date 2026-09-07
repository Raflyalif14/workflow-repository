import { z } from 'zod';

export const deleteProjectSchema = z.object({
  confirmation: z.string().min(1).max(500),
}).strict();
