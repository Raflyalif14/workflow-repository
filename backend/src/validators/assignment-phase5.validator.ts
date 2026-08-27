import { z } from 'zod';

export const assignPicSchema = z.object({ pic_id: z.string().uuid(), reason: z.string().trim().optional() });