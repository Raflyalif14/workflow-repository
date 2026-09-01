import { supabaseAdmin } from '../config/supabase';
import {
  ListNotificationsQuery,
  UpdateNotificationPreferencesInput,
} from '../validators/notification.validator';

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  project_id: string | null;
  milestone_id: string | null;
  action_url: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

type NotificationPreferenceRow = {
  in_app_enabled: boolean;
  telegram_enabled: boolean;
  telegram_chat_id: string | null;
  telegram_username: string | null;
  telegram_linked_at: string | null;
};

export type CreateNotificationInput = {
  userId: string;
  type: string;
  title: string;
  message: string;
  projectId?: string | null;
  milestoneId?: string | null;
  actionUrl?: string | null;
};

export class NotificationServiceError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'NotificationServiceError';
  }
}

const notificationFields = 'id,type,title,message,project_id,milestone_id,action_url,is_read,read_at,created_at';
const preferenceFields = 'in_app_enabled,telegram_enabled,telegram_chat_id,telegram_username,telegram_linked_at';

const defaultPreferences: NotificationPreferenceRow = {
  in_app_enabled: true,
  telegram_enabled: false,
  telegram_chat_id: null,
  telegram_username: null,
  telegram_linked_at: null,
};

const databaseError = (context: string, error: unknown): NotificationServiceError => {
  console.error(`[NotificationService] ${context}`, error);
  return new NotificationServiceError(`Failed to ${context}.`, 500);
};

const requiredText = (value: unknown, field: string): string => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) throw new NotificationServiceError(`${field} is required.`);
  return trimmed;
};

const optionalText = (value: string | null | undefined): string | null => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || null;
};

export class NotificationService {
  private static async getStoredPreferences(userId: string): Promise<NotificationPreferenceRow | null> {
    const { data, error } = await supabaseAdmin
      .from('notification_preferences')
      .select(preferenceFields)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw databaseError('retrieve notification preferences', error);
    return (data as NotificationPreferenceRow | null) || null;
  }

  static async listForUser(userId: string, options: ListNotificationsQuery): Promise<NotificationRow[]> {
    const limit = Math.min(Math.max(options.limit, 1), 100);
    const offset = Math.max(options.offset, 0);
    let request: any = supabaseAdmin
      .from('notifications')
      .select(notificationFields)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (options.unread_only) request = request.eq('is_read', false);

    const { data, error } = await request;
    if (error) throw databaseError('retrieve notifications', error);
    return (data || []) as NotificationRow[];
  }

  static async getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
    const { count, error } = await supabaseAdmin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) throw databaseError('retrieve unread notification count', error);
    return { unreadCount: count || 0 };
  }

  static async markAsRead(notificationId: string, userId: string): Promise<NotificationRow> {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId)
      .select(notificationFields)
      .maybeSingle();

    if (error) throw databaseError('mark notification as read', error);
    if (!data) throw new NotificationServiceError('Notification not found', 404);
    return data as NotificationRow;
  }

  static async markAllAsRead(userId: string): Promise<{ success: true }> {
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) throw databaseError('mark notifications as read', error);
    return { success: true };
  }

  static async getPreferences(userId: string): Promise<NotificationPreferenceRow> {
    return (await this.getStoredPreferences(userId)) || { ...defaultPreferences };
  }

  static async updatePreferences(
    userId: string,
    input: UpdateNotificationPreferencesInput
  ): Promise<NotificationPreferenceRow> {
    const existingPreferences = await this.getStoredPreferences(userId);
    if (input.telegram_enabled === true && !existingPreferences?.telegram_chat_id) {
      throw new NotificationServiceError('Connect Telegram before enabling Telegram notifications.');
    }

    const preferences: {
      user_id: string;
      in_app_enabled?: boolean;
      telegram_enabled?: boolean;
    } = { user_id: userId };
    if (input.in_app_enabled !== undefined) preferences.in_app_enabled = input.in_app_enabled;
    if (input.telegram_enabled !== undefined) preferences.telegram_enabled = input.telegram_enabled;

    const { data, error } = await supabaseAdmin
      .from('notification_preferences')
      .upsert(preferences, { onConflict: 'user_id' })
      .select(preferenceFields)
      .single();

    if (error || !data) throw databaseError('update notification preferences', error);
    return data as NotificationPreferenceRow;
  }

  static async createNotification(input: CreateNotificationInput): Promise<NotificationRow> {
    const userId = requiredText(input.userId, 'Notification user ID');
    const type = requiredText(input.type, 'Notification type');
    const title = requiredText(input.title, 'Notification title');
    const message = requiredText(input.message, 'Notification message');

    const { data, error } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        title,
        message,
        project_id: optionalText(input.projectId),
        milestone_id: optionalText(input.milestoneId),
        action_url: optionalText(input.actionUrl),
      })
      .select(notificationFields)
      .single();

    if (error || !data) throw databaseError('create notification', error);
    return data as NotificationRow;
  }
}
