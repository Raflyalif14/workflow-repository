import { z } from 'zod';

export const userRoleEnum = z.enum(['SUPER_ADMIN', 'SALES', 'HEAD_SA', 'SA']);
export const loginSchema = z.object({ email: z.string().email('Invalid email format'), password: z.string().min(1, 'Password is required') });
export const registerSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name is required'),
  email: z.string().trim().email('Invalid email format').transform((value) => value.toLowerCase()),
});
export const changeInitialPasswordSchema = z.object({
  new_password: z.string().min(12, 'Password must be at least 12 characters'),
});
export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Invalid email format').transform((value) => value.toLowerCase()),
});
export const resetPasswordSchema = z.object({
  token_hash: z.string().trim().min(1, 'token_hash is required'),
  new_password: z.string().min(12, 'Password must be at least 12 characters'),
});
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ChangeInitialPasswordInput = z.infer<typeof changeInitialPasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UserRole = z.infer<typeof userRoleEnum>;
