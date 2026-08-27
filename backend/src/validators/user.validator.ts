import { z } from 'zod';
import { userRoleEnum } from './auth.validator';

export const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Full name is required'),
  role: userRoleEnum.default('SA'),
  isActive: z.boolean().default(true),
});
export const updateUserSchema = z.object({ fullName: z.string().min(2).optional(), role: userRoleEnum.optional() });
export const listUsersQuerySchema = z.object({ page: z.coerce.number().min(1).default(1), limit: z.coerce.number().min(1).max(100).default(10), search: z.string().optional(), role: userRoleEnum.optional(), isActive: z.enum(['true', 'false']).optional() });
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
