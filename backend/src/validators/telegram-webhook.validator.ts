import { z } from 'zod';

const telegramChatIdSchema = z.union([
  z.number().int().safe(),
  z.string().regex(/^-?\d+$/, 'Telegram chat ID must be numeric'),
]);

export const telegramWebhookUpdateSchema = z
  .object({
    message: z
      .object({
        text: z.string().max(512).optional(),
        chat: z.object({ id: telegramChatIdSchema }).passthrough(),
        from: z.object({ username: z.string().min(1).max(64).optional() }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type TelegramWebhookUpdate = z.infer<typeof telegramWebhookUpdateSchema>;
