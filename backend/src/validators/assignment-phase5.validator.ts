import { z } from 'zod';
export const picRequestFields = {
  expected_pic_revision: z.string().regex(/^\d{1,19}$/).refine(value => BigInt(value) <= BigInt('9223372036854775807')),
  request_id: z.string().uuid(),
};
export const assignPicSchema = z.object({ pic_id: z.string().uuid(), reason: z.string().trim().max(2000).optional(), ...picRequestFields }).strict();
