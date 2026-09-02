import { z } from 'zod';
import { userRoleEnum } from './auth.validator';

export const createUserSchema = z.object({
  email: z.string().trim().email('Invalid email address').transform((value) => value.toLowerCase()),
  fullName: z.string().trim().min(2, 'Full name is required'),
  role: userRoleEnum,
  isActive: z.boolean().default(true),
}).strict();
export const updateUserSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Full name is required').optional(),
    role: userRoleEnum.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((input) => input.fullName !== undefined || input.role !== undefined || input.isActive !== undefined, {
    message: 'At least one editable user field is required.',
  });
export const updateUserStatusSchema = z.object({ isActive: z.boolean() }).strict();
export const listUsersQuerySchema = z.object({ page: z.coerce.number().min(1).default(1), limit: z.coerce.number().min(1).max(100).default(10), search: z.string().optional(), role: userRoleEnum.optional(), isActive: z.enum(['true', 'false']).optional() });
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
