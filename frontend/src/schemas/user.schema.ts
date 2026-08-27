import { z } from "zod";

export const userRoleSchema = z.enum([
  "SUPER_ADMIN",
  "SALES",
  "HEAD_SA",
  "SA",
]);

export const createUserFormSchema = z.object({
  email: z.string().email("Invalid email address format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(2, "Full name is required"),
  role: userRoleSchema,
  isActive: z.boolean().default(true),
});

export const updateUserFormSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  role: userRoleSchema,
  isActive: z.boolean().default(true),
});

export const resetPasswordFormSchema = z
  .object({
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Confirm password is required"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type CreateUserFormValues = z.infer<typeof createUserFormSchema>;
export type UpdateUserFormValues = z.infer<typeof updateUserFormSchema>;
export type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>;
