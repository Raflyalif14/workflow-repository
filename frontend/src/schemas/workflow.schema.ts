import { z } from "zod";

export const workflowFormSchema = z.object({
  name: z
    .string()
    .min(3, "Workflow name must be at least 3 characters")
    .max(50, "Workflow name cannot exceed 50 characters"),
  slug: z
    .string()
    .min(3, "Slug must be at least 3 characters")
    .regex(/^[a-z0-9-]+$/, "Slug must only contain lowercase letters, numbers, and hyphens"),
  description: z.string().optional(),
  category: z.string().min(1, "Please select a category"),
  tags: z.string().transform((val) =>
    val
      ? val
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : []
  ),
  repositoryId: z.string().min(1, "Please select a repository"),
});

export type WorkflowFormValues = z.input<typeof workflowFormSchema>;
