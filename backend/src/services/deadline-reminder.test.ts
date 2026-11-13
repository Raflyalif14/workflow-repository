import assert from 'node:assert/strict';
import { ENV } from '../config/env';
import { supabaseAdmin } from '../config/supabase';
import { DeadlineReminderWorker } from './deadline-reminder.worker';
import { EmailService, buildDeadlineReminderEmail } from './email.service';

async function main() {
  const original = { rpc: supabaseAdmin.rpc, from: supabaseAdmin.from,
    send: EmailService.sendDeadlineReminderEmail, host: ENV.SMTP_HOST, base: ENV.APP_BASE_URL };
  const logs = console.error;
  let rpcCalls: string[] = [], updates: any[] = [], filters: any[] = [], sends = 0;
  let failure = false, accepted = true;
  const claim = { notification_id: 'synthetic-id', lease_token: 'lease', attempt_count: 1,
    email: 'test@example.invalid', title: 'Deadline tomorrow', message: '<script>test</script>',
    action_url: '/projects/synthetic#project-milestone-synthetic' };
  try {
    console.error = () => {};
    ENV.SMTP_HOST = 'synthetic-only'; ENV.APP_BASE_URL = 'https://example.invalid';
    (supabaseAdmin as any).rpc = async (name: string) => {
      rpcCalls.push(name);
      return { data: name === 'enqueue_deadline_reminders' ? 1 : [claim], error: null };
    };
    (supabaseAdmin as any).from = (name: string) => {
      assert.equal(name, 'deadline_reminder_emails');
      return { update(value: any) { updates.push(value); return {
        eq(key: string, value: any) { filters.push([key, value]); return this; },
        then(resolve: any) { return Promise.resolve({ error: null }).then(resolve); },
      }; } };
    };
    EmailService.sendDeadlineReminderEmail = async () => {
      sends++; if (failure) throw Error('synthetic SMTP credential must not be logged');
      return { accepted: accepted ? ['test@example.invalid'] : [] } as any;
    };
    await DeadlineReminderWorker.runOnceBestEffort();
    assert.equal(sends, 1); assert.equal(updates.at(-1).status, 'SENT');
    assert.deepEqual(filters, [['notification_id', 'synthetic-id'], ['lease_token', 'lease'], ['status', 'SENDING']]);
    failure = true;
    await DeadlineReminderWorker.runOnceBestEffort();
    assert.equal(updates.at(-1).status, 'PENDING');
    assert(!JSON.stringify(updates).includes('credential'));
    claim.attempt_count = 3;
    await DeadlineReminderWorker.runOnceBestEffort();
    assert.equal(updates.at(-1).status, 'FAILED');
    failure = false; accepted = false;
    await DeadlineReminderWorker.runOnceBestEffort();
    assert.equal(updates.at(-1).status, 'FAILED', 'SMTP rejection is not successful delivery');
    ENV.SMTP_HOST = ''; rpcCalls = [];
    await DeadlineReminderWorker.runOnceBestEffort();
    assert.deepEqual(rpcCalls, ['enqueue_deadline_reminders'], 'missing SMTP leaves email jobs unclaimed');

    let release!: () => void;
    (supabaseAdmin as any).rpc = async () => { rpcCalls.push('held'); await new Promise<void>(resolve => { release = resolve; }); return { error: null }; };
    const active = DeadlineReminderWorker.runOnceBestEffort();
    await DeadlineReminderWorker.runOnceBestEffort();
    assert.equal(rpcCalls.filter(name => name === 'held').length, 1, 'overlapping ticks are skipped');
    release(); await active;

    const email = buildDeadlineReminderEmail({ recipientEmail: claim.email, title: claim.title,
      message: claim.message, actionUrl: claim.action_url, notificationId: claim.notification_id });
    assert(String(email.html).includes('&lt;script&gt;')); assert(!String(email.html).includes('<script>'));
    assert(String(email.text).includes('https://example.invalid/projects/synthetic'));
    assert.equal(email.messageId, '<deadline-synthetic-id@workflow-repository.local>');
    console.log('PASS reminder worker, SMTP acceptance/retry limits, concurrency, lease guards and escaped email');
  } finally {
    (supabaseAdmin as any).rpc = original.rpc; (supabaseAdmin as any).from = original.from;
    EmailService.sendDeadlineReminderEmail = original.send; ENV.SMTP_HOST = original.host; ENV.APP_BASE_URL = original.base;
    console.error = logs; DeadlineReminderWorker.stop();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
