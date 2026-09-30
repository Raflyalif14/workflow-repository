import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = (name: string) => readFileSync(join(__dirname, '../../supabase', name), 'utf8').replace(/\r\n/g, '\n');
const phase20 = migration('phase20-output-notification-failure-diagnostics.sql');
const phase21 = migration('phase21-output-notification-variable-conflict.sql');
const functionAndPermissions = (sql: string) => sql.slice(sql.indexOf('create or replace function public.deliver_pending_output_notifications'));

assert.match(phase21, /as \$\$\n#variable_conflict use_column\ndeclare\n/,
  'PL/pgSQL must prefer table columns before declaring local variables');
assert.equal((phase21.match(/#variable_conflict use_column/g) || []).length, 1);
assert.equal(
  functionAndPermissions(phase21).replace('#variable_conflict use_column\n', ''),
  functionAndPermissions(phase20),
  'Phase 21 must preserve Phase 20 signature, body, retry diagnostics, and permissions exactly'
);
assert.match(phase21, /on conflict \(notification_id, channel\) do nothing;/,
  'ON CONFLICT must resolve notification_id as the delivery column');
assert.match(phase21, /returning id into v_notification_id;/,
  'INSERT must retain the distinct local notification ID variable');
assert.match(phase21, /notification_id := v_notification_id;[\s\S]*notification_id := null;/,
  'success and failure rows must still set the returned notification_id output variable');
console.log('Phase 21 variable conflict directive and Phase 20 behavior parity: passed');
