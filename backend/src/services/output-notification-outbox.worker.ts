import { supabaseAdmin } from '../config/supabase';

const RETRY_INTERVAL_MS = 60_000;

export class OutputNotificationOutboxWorker {
  private static interval: NodeJS.Timeout | null = null;
  private static running = false;

  static start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => { void this.runOnceBestEffort(); }, RETRY_INTERVAL_MS);
    void this.runOnceBestEffort();
  }

  static stop(): void {
    if (!this.interval) return;
    clearInterval(this.interval);
    this.interval = null;
  }

  static async runOnceBestEffort(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { data, error } = await supabaseAdmin.rpc('deliver_pending_output_notifications', { p_limit: 20 });
      if (error) throw error;
      if ((data || []).some((item: { failed: boolean }) => item.failed)) {
        console.error('[OutputNotificationOutbox] Some notifications remain pending for retry.');
      }
    } catch {
      console.error('[OutputNotificationOutbox] Notification delivery attempt failed.');
    } finally {
      this.running = false;
    }
  }
}
