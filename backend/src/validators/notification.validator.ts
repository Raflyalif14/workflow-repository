import { z } from 'zod';

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  unread_only: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
});

export const notificationIdSchema = z.string().uuid('Valid notification ID is required');

export const updateNotificationPreferencesSchema = z
  .object({
    in_app_enabled: z.boolean().optional(),
    telegram_enabled: z.boolean().optional(),
  })
  .strict()
  .refine(
    (input) => input.in_app_enabled !== undefined || input.telegram_enabled !== undefined,
    'At least one notification preference must be provided.'
  );

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
export type UpdateNotificationPreferencesInput = z.infer<typeof updateNotificationPreferencesSchema>;
