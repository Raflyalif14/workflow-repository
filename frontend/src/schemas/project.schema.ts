import { z } from "zod";

export const createProjectFormSchema = z.object({
  projectCode: z
    .string()
    .min(3, "Project code must be at least 3 characters")
    .max(30, "Project code cannot exceed 30 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Alphanumeric, dashes, or underscores only"),
  name: z.string().min(3, "Project title is required"),
  clientName: z.string().min(2, "Customer name is required"),
  description: z.string().optional(),
  scenarioId: z.string().min(1, "Please select a workflow scenario"),
  startDate: z.string().min(1, "Start date is required"),
  targetEndDate: z.string().optional(),
});

export const postponeProjectFormSchema = z.object({
  newTargetEndDate: z.string().min(1, "Please pick a new deadline"),
  reason: z.string().min(5, "Postpone reason must be at least 5 characters"),
});

export const triggerMilestoneFormSchema = z.object({
  status: z.enum([
    "NOT_STARTED",
    "IN_PROGRESS",
    "WAITING_APPROVAL",
    "APPROVED",
    "REJECTED",
    "COMPLETED",
    "OVERDUE",
  ]),
  notes: z.string().optional(),
});

export type CreateProjectFormValues = z.infer<typeof createProjectFormSchema>;
export type PostponeProjectFormValues = z.infer<typeof postponeProjectFormSchema>;
export type TriggerMilestoneFormValues = z.infer<typeof triggerMilestoneFormSchema>;
