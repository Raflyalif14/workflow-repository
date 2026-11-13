import { supabaseAdmin } from '../config/supabase';
import { ENV } from '../config/env';
import { EmailService } from './email.service';

type ClaimedEmail = { notification_id: string; lease_token: string; attempt_count: number;
  email: string; title: string; message: string; action_url: string | null };

export class DeadlineReminderWorker {
  private static interval: NodeJS.Timeout | null = null;
  private static running = false;

  static start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => { void this.runOnceBestEffort(); }, 60_000);
    void this.runOnceBestEffort();
  }

  static stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  static async runOnceBestEffort(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const queued = await supabaseAdmin.rpc('enqueue_deadline_reminders');
      if (queued.error) throw queued.error;
      // Leave email jobs pending until SMTP is configured. In-app and Telegram still work.
      if (!ENV.SMTP_HOST.trim()) return;
      const claimed = await supabaseAdmin.rpc('claim_deadline_reminder_emails', { p_limit: 5 });
      if (claimed.error) throw claimed.error;
      await Promise.all(((claimed.data || []) as ClaimedEmail[]).map(async item => {
        try { await this.deliverEmail(item); }
        catch { console.error('[DeadlineReminder] Email delivery state could not be saved.'); }
      }));
    } catch {
      console.error('[DeadlineReminder] Reminder processing failed. Check Phase 45 migration and database availability.');
    } finally { this.running = false; }
  }

  private static async deliverEmail(item: ClaimedEmail): Promise<void> {
    let sent = false;
    try {
      const result = await EmailService.sendDeadlineReminderEmail({ recipientEmail: item.email,
        title: item.title, message: item.message, actionUrl: item.action_url,
        notificationId: item.notification_id });
      sent = Array.isArray(result.accepted) && result.accepted.length > 0;
    } catch { /* Persist a generic failure without SMTP credentials or recipient content. */ }
    const { error } = await supabaseAdmin.from('deadline_reminder_emails').update({
      status: sent ? 'SENT' : item.attempt_count >= 3 ? 'FAILED' : 'PENDING',
      sent_at: sent ? new Date().toISOString() : null,
      last_error: sent ? null : 'SMTP did not confirm email acceptance.',
      lease_token: null,
      next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    }).eq('notification_id', item.notification_id).eq('lease_token', item.lease_token).eq('status', 'SENDING');
    if (error) throw error;
  }
}
