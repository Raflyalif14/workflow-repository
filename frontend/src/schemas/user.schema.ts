import { z } from "zod";

export const userRoleSchema = z.enum([
  "SUPER_ADMIN",
  "SALES",
  "HEAD_SA",
  "SA",
]);

export const createUserFormSchema = z.object({
  email: z.string().trim().email("userForm.invalidEmail"),
  fullName: z.string().trim().min(2, "userForm.fullNameRequired"),
  role: userRoleSchema,
  isActive: z.boolean().default(true),
});

export const updateUserFormSchema = z.object({
  fullName: z.string().trim().min(2, "userForm.fullNameRequired"),
  role: userRoleSchema,
  isActive: z.boolean().default(true),
});

export type CreateUserFormValues = z.infer<typeof createUserFormSchema>;
export type UpdateUserFormValues = z.infer<typeof updateUserFormSchema>;
