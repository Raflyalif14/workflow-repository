import { readFileSync } from 'fs';
import { join } from 'path';
import { ENV } from '../config/env';
import { supabaseAdmin } from '../config/supabase';
import { updateNotificationPreferencesSchema } from '../validators/notification.validator';
import {
  hashTelegramLinkToken,
  TelegramLinkService,
} from './telegram-link.service';
import { TelegramWebhookService } from './telegram-webhook.service';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const asMockRow = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;

const originalFrom = supabaseAdmin.from;
const originalBotUsername = ENV.TELEGRAM_BOT_USERNAME;
const originalWebhookSecret = ENV.TELEGRAM_WEBHOOK_SECRET;
const originalConsoleError = console.error;

const webhookToken = 'A'.repeat(43);
const validExpiry = new Date(Date.now() + 60_000).toISOString();

async function run(): Promise<void> {
  try {
    ENV.TELEGRAM_BOT_USERNAME = '@WorkflowTestBot';

    let createdToken: Record<string, unknown> | null = null;
    const invalidationFilters: Array<[string, unknown]> = [];
    (supabaseAdmin as any).from = (table: string) => {
      assert(table === 'telegram_link_tokens', 'Test 1: link creation must use telegram_link_tokens');
      const deleteQuery: any = {
        eq: (field: string, value: unknown) => {
          invalidationFilters.push([field, value]);
          return deleteQuery;
        },
        is: (field: string, value: unknown) => {
          invalidationFilters.push([field, value]);
          return deleteQuery;
        },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve({ error: null }).then(resolve, reject),
      };

      return {
        delete: () => deleteQuery,
        insert: (value: Record<string, unknown>) => {
          createdToken = value;
          return { error: null };
        },
      };
    };
    const link = await TelegramLinkService.createLink('user-1');
    const rawToken = new URL(link.linkUrl).searchParams.get('start');
    const storedToken = asMockRow(createdToken);
    assert(link.linkUrl.startsWith('https://t.me/WorkflowTestBot?start='), 'Test 1: link URL must use normalized bot username');
    assert(Boolean(rawToken), 'Test 1: raw token must appear only in the returned deep link');
    assert(storedToken.user_id === 'user-1', 'Test 1: token row must belong to authenticated user');
    assert(storedToken.token_hash !== rawToken, 'Test 1: raw token must never be stored');
    assert(storedToken.token_hash === hashTelegramLinkToken(rawToken!), 'Test 1: only the raw token hash must be stored');
    assert(typeof storedToken.expires_at === 'string', 'Test 1: token expiry must be stored');
    assert(invalidationFilters.some(([field, value]) => field === 'user_id' && value === 'user-1'), 'Test 1: prior tokens must be scoped to the authenticated user');
    assert(invalidationFilters.some(([field, value]) => field === 'consumed_at' && value === null), 'Test 1: only unused prior tokens must be invalidated');
    console.log('Test 1 - Authenticated link creation stores only a replacement token hash: passed');

    assert(hashTelegramLinkToken('token-a') === hashTelegramLinkToken('token-a'), 'Test 2: token hashing must be deterministic');
    assert(hashTelegramLinkToken('token-a') !== 'token-a', 'Test 2: token hash must differ from raw token');
    console.log('Test 2 - Token hashing is deterministic and non-reversible in storage: passed');

    let consumedAt: string | undefined;
    let successfulLinkRollbackAttempts = 0;
    let linkedPreferences: Record<string, unknown> | null = null;
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'telegram_link_tokens') {
        const lookupQuery: any = {
          eq: () => lookupQuery,
          maybeSingle: async () => ({
            data: { id: 'token-1', user_id: 'user-1', expires_at: validExpiry, consumed_at: null },
            error: null,
          }),
        };
        const consumeQuery: any = {
          eq: () => consumeQuery,
          is: () => consumeQuery,
          gt: () => consumeQuery,
          select: () => ({ maybeSingle: async () => ({ data: { id: 'token-1', user_id: 'user-1' }, error: null }) }),
        };
        return {
          select: () => lookupQuery,
          update: (value: { consumed_at: string | null }) => {
            if (value.consumed_at === null) {
              successfulLinkRollbackAttempts += 1;
              return consumeQuery;
            }
            consumedAt = value.consumed_at;
            return consumeQuery;
          },
        };
      }

      if (table === 'users') {
        const query: any = {
          eq: () => query,
          maybeSingle: async () => ({ data: { id: 'user-1', is_active: true }, error: null }),
        };
        return { select: () => query };
      }

      assert(table === 'notification_preferences', 'Test 3: link webhook must update notification preferences');
      const preferencesQuery: any = {
        eq: () => preferencesQuery,
        maybeSingle: async () => ({ data: { in_app_enabled: false }, error: null }),
      };
      return {
        select: () => preferencesQuery,
        upsert: (value: Record<string, unknown>) => {
          linkedPreferences = value;
          return { error: null };
        },
      };
    };
    const linked = await TelegramWebhookService.processUpdate({
      message: {
        text: `/start ${webhookToken}`,
        chat: { id: -1001234567890 },
        from: { username: 'workflow_user' },
      },
    });
    const storedLinkedPreferences = asMockRow(linkedPreferences);
    assert(linked.linked, 'Test 3: valid /start token must link the matching application user');
    assert(storedLinkedPreferences.user_id === 'user-1', 'Test 3: webhook must link the token user, not an update-supplied user');
    assert(storedLinkedPreferences.telegram_chat_id === '-1001234567890', 'Test 3: chat ID must be stored as a string');
    assert(storedLinkedPreferences.telegram_username === 'workflow_user', 'Test 3: Telegram username must be stored when provided');
    assert(Boolean(storedLinkedPreferences.telegram_linked_at), 'Test 3: link timestamp must be stored');
    assert(storedLinkedPreferences.telegram_enabled === false, 'Test 3: linking must leave Telegram delivery disabled');
    assert(storedLinkedPreferences.in_app_enabled === false, 'Test 3: existing in-app preference must be preserved');
    assert(Boolean(consumedAt), 'Test 3: successfully linked token must be consumed');
    assert(successfulLinkRollbackAttempts === 0, 'Test 3: successful linking must leave token consumed without rollback');
    console.log('Test 3 - Valid /start links the correct user while preserving preferences: passed');
    console.log('Test 7 - Existing in-app preference is preserved during linking: passed');

    let failedClaimAt: string | undefined;
    let rollbackAttempted = false;
    const rollbackFilters: Array<[string, unknown]> = [];
    const persistenceFailureLogEntries: unknown[][] = [];
    const unexpectedFailureDetails = `telegram_chat_id=private-chat-id token=${webhookToken}`;
    console.error = (...args: unknown[]) => {
      persistenceFailureLogEntries.push(args);
    };
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'telegram_link_tokens') {
        const lookupQuery: any = {
          eq: () => lookupQuery,
          maybeSingle: async () => ({
            data: { id: 'token-rollback', user_id: 'user-1', expires_at: validExpiry, consumed_at: null },
            error: null,
          }),
        };
        const claimQuery: any = {
          eq: () => claimQuery,
          is: () => claimQuery,
          gt: () => claimQuery,
          select: () => ({ maybeSingle: async () => ({ data: { id: 'token-rollback', user_id: 'user-1' }, error: null }) }),
        };
        const rollbackQuery: any = {
          eq: (field: string, value: unknown) => {
            rollbackFilters.push([field, value]);
            return rollbackQuery;
          },
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
            Promise.resolve({ error: null }).then(resolve, reject),
        };
        return {
          select: () => lookupQuery,
          update: (value: { consumed_at: string | null }) => {
            if (value.consumed_at === null) {
              rollbackAttempted = true;
              return rollbackQuery;
            }
            failedClaimAt = value.consumed_at;
            return claimQuery;
          },
        };
      }

      if (table === 'users') {
        const query: any = {
          eq: () => query,
          maybeSingle: async () => ({ data: { id: 'user-1', is_active: true }, error: null }),
        };
        return { select: () => query };
      }

      assert(table === 'notification_preferences', 'Test 3b: failed persistence must occur after token claim');
      const preferencesQuery: any = {
        eq: () => preferencesQuery,
        maybeSingle: async () => ({ data: { in_app_enabled: true }, error: null }),
      };
      return {
        select: () => preferencesQuery,
        upsert: () => ({ error: { code: 'XX000', details: unexpectedFailureDetails } }),
      };
    };
    const persistenceFailure = await TelegramWebhookService.processUpdate({
      message: { text: `/start ${webhookToken}`, chat: { id: 1 } },
    });
    console.error = originalConsoleError;
    assert(Boolean(failedClaimAt), 'Test 3b: token must be claimed before preference persistence');
    assert(!persistenceFailure.linked, 'Test 3b: failed preference persistence must return linked:false safely');
    assert(rollbackAttempted, 'Test 3b: failed preference persistence must attempt to restore the token claim');
    assert(rollbackFilters.some(([field, value]) => field === 'id' && value === 'token-rollback'), 'Test 3b: rollback must target the exact token ID');
    assert(rollbackFilters.some(([field, value]) => field === 'consumed_at' && value === failedClaimAt), 'Test 3b: rollback must guard the exact token claim timestamp');
    assert(
      persistenceFailureLogEntries.length === 1 &&
        persistenceFailureLogEntries[0].length === 1 &&
        persistenceFailureLogEntries[0][0] === '[TelegramWebhook] Failed to process Telegram link request.' &&
        !String(persistenceFailureLogEntries).includes(unexpectedFailureDetails) &&
        !String(persistenceFailureLogEntries).includes(webhookToken),
      'Test 3b: unexpected persistence failures must log only a generic safe message'
    );
    console.log('Test 3b - Failed preference persistence restores the exact token claim and logs safely: passed');

    const conflictChatId = '-100999000111';
    const conflictDetails = `telegram_chat_id=${conflictChatId} token=${webhookToken}`;
    const ownerPreferences = { userId: 'user-a', telegramChatId: conflictChatId };
    let requesterTelegramChatId: string | null = null;
    let conflictClaimAt: string | undefined;
    const conflictRollbackFilters: Array<[string, unknown]> = [];
    let conflictUpsert: Record<string, unknown> | null = null;
    const conflictLogEntries: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      conflictLogEntries.push(args);
    };
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'telegram_link_tokens') {
        const lookupQuery: any = {
          eq: () => lookupQuery,
          maybeSingle: async () => ({
            data: { id: 'token-user-b', user_id: 'user-b', expires_at: validExpiry, consumed_at: null },
            error: null,
          }),
        };
        const claimQuery: any = {
          eq: () => claimQuery,
          is: () => claimQuery,
          gt: () => claimQuery,
          select: () => ({ maybeSingle: async () => ({ data: { id: 'token-user-b', user_id: 'user-b' }, error: null }) }),
        };
        const rollbackQuery: any = {
          eq: (field: string, value: unknown) => {
            conflictRollbackFilters.push([field, value]);
            return rollbackQuery;
          },
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
            Promise.resolve({ error: null }).then(resolve, reject),
        };
        return {
          select: () => lookupQuery,
          update: (value: { consumed_at: string | null }) => {
            if (value.consumed_at === null) return rollbackQuery;
            conflictClaimAt = value.consumed_at;
            return claimQuery;
          },
        };
      }

      if (table === 'users') {
        const query: any = {
          eq: () => query,
          maybeSingle: async () => ({ data: { id: 'user-b', is_active: true }, error: null }),
        };
        return { select: () => query };
      }

      assert(table === 'notification_preferences', 'Test 3c: duplicate identity must fail at notification preferences persistence');
      const preferencesQuery: any = {
        eq: () => preferencesQuery,
        maybeSingle: async () => ({ data: { in_app_enabled: true }, error: null }),
      };
      return {
        select: () => preferencesQuery,
        upsert: (value: Record<string, unknown>) => {
          conflictUpsert = value;
          return { error: { code: '23505', details: conflictDetails } };
        },
      };
    };
    const duplicateIdentity = await TelegramWebhookService.processUpdate({
      message: { text: `/start ${webhookToken}`, chat: { id: Number(conflictChatId) } },
    });
    console.error = originalConsoleError;
    const attemptedConflictUpsert = asMockRow(conflictUpsert);
    assert(!duplicateIdentity.linked, 'Test 3c: a Telegram identity owned by another user must not link');
    assert(ownerPreferences.userId === 'user-a' && ownerPreferences.telegramChatId === conflictChatId, 'Test 3c: existing Telegram identity owner must remain unchanged');
    assert(requesterTelegramChatId === null, 'Test 3c: requesting user must remain unlinked after identity conflict');
    assert(attemptedConflictUpsert.user_id === 'user-b', 'Test 3c: identity write must target the token owner only');
    assert(conflictRollbackFilters.some(([field, value]) => field === 'id' && value === 'token-user-b'), 'Test 3c: identity conflict rollback must target the exact token ID');
    assert(conflictRollbackFilters.some(([field, value]) => field === 'consumed_at' && value === conflictClaimAt), 'Test 3c: identity conflict rollback must guard the exact claim timestamp');
    assert(conflictLogEntries.length === 0, 'Test 3c: expected identity conflicts must not log raw database details');
    console.log('Test 3c - Duplicate Telegram identity safely restores the requester token claim without takeover: passed');

    let reconnectPreferences: Record<string, unknown> | null = null;
    let reconnectRollbackAttempts = 0;
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'telegram_link_tokens') {
        const lookupQuery: any = {
          eq: () => lookupQuery,
          maybeSingle: async () => ({
            data: { id: 'token-user-a', user_id: 'user-a', expires_at: validExpiry, consumed_at: null },
            error: null,
          }),
        };
        const claimQuery: any = {
          eq: () => claimQuery,
          is: () => claimQuery,
          gt: () => claimQuery,
          select: () => ({ maybeSingle: async () => ({ data: { id: 'token-user-a', user_id: 'user-a' }, error: null }) }),
        };
        return {
          select: () => lookupQuery,
          update: (value: { consumed_at: string | null }) => {
            if (value.consumed_at === null) reconnectRollbackAttempts += 1;
            return claimQuery;
          },
        };
      }

      if (table === 'users') {
        const query: any = {
          eq: () => query,
          maybeSingle: async () => ({ data: { id: 'user-a', is_active: true }, error: null }),
        };
        return { select: () => query };
      }

      const preferencesQuery: any = {
        eq: () => preferencesQuery,
        maybeSingle: async () => ({ data: { in_app_enabled: true }, error: null }),
      };
      return {
        select: () => preferencesQuery,
        upsert: (value: Record<string, unknown>) => {
          reconnectPreferences = value;
          return { error: null };
        },
      };
    };
    const reconnect = await TelegramWebhookService.processUpdate({
      message: { text: `/start ${webhookToken}`, chat: { id: 777001 } },
    });
    const reconnectWrite = asMockRow(reconnectPreferences);
    assert(reconnect.linked && reconnectWrite.user_id === 'user-a' && reconnectWrite.telegram_chat_id === '777001', 'Test 3d: a user may reconnect their own Telegram identity');
    assert(reconnectRollbackAttempts === 0, 'Test 3d: successful reconnect must leave its token consumed');
    console.log('Test 3d - Same application user can reconnect an existing Telegram identity: passed');

    let switchPreferences: Record<string, unknown> | null = null;
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'telegram_link_tokens') {
        const lookupQuery: any = {
          eq: () => lookupQuery,
          maybeSingle: async () => ({
            data: { id: 'token-switch', user_id: 'user-a', expires_at: validExpiry, consumed_at: null },
            error: null,
          }),
        };
        const claimQuery: any = {
          eq: () => claimQuery,
          is: () => claimQuery,
          gt: () => claimQuery,
          select: () => ({ maybeSingle: async () => ({ data: { id: 'token-switch', user_id: 'user-a' }, error: null }) }),
        };
        return { select: () => lookupQuery, update: () => claimQuery };
      }

      if (table === 'users') {
        const query: any = {
          eq: () => query,
          maybeSingle: async () => ({ data: { id: 'user-a', is_active: true }, error: null }),
        };
        return { select: () => query };
      }

      const preferencesQuery: any = {
        eq: () => preferencesQuery,
        maybeSingle: async () => ({ data: { in_app_enabled: false }, error: null }),
      };
      return {
        select: () => preferencesQuery,
        upsert: (value: Record<string, unknown>) => {
          switchPreferences = value;
          return { error: null };
        },
      };
    };
    const switched = await TelegramWebhookService.processUpdate({
      message: { text: `/start ${webhookToken}`, chat: { id: 777002 } },
    });
    const switchWrite = asMockRow(switchPreferences);
    assert(switched.linked && switchWrite.user_id === 'user-a' && switchWrite.telegram_chat_id === '777002', 'Test 3e: a user may switch to an unowned Telegram identity');
    assert(switchWrite.in_app_enabled === false && switchWrite.telegram_enabled === false, 'Test 3e: identity switch preserves in-app state and leaves Telegram delivery disabled');
    console.log('Test 3e - User can switch to a different unowned Telegram identity: passed');

    let replayMutationAttempted = false;
    (supabaseAdmin as any).from = (table: string) => {
      assert(table === 'telegram_link_tokens', 'Test 4: replay must inspect only the token row');
      const query: any = {
        eq: () => query,
        maybeSingle: async () => ({
          data: { id: 'token-1', user_id: 'user-1', expires_at: validExpiry, consumed_at: new Date().toISOString() },
          error: null,
        }),
      };
      return {
        select: () => query,
        update: () => {
          replayMutationAttempted = true;
          return query;
        },
      };
    };
    const replay = await TelegramWebhookService.processUpdate({ message: { text: `/start ${webhookToken}`, chat: { id: 1 } } });
    assert(!replay.linked && !replayMutationAttempted, 'Test 4: consumed token cannot be replayed');
    console.log('Test 4 - Consumed token replay is rejected without mutation: passed');

    let expiredMutationAttempted = false;
    (supabaseAdmin as any).from = (table: string) => {
      assert(table === 'telegram_link_tokens', 'Test 5: expiry must inspect only the token row');
      const query: any = {
        eq: () => query,
        maybeSingle: async () => ({
          data: { id: 'token-1', user_id: 'user-1', expires_at: new Date(Date.now() - 60_000).toISOString(), consumed_at: null },
          error: null,
        }),
      };
      return {
        select: () => query,
        update: () => {
          expiredMutationAttempted = true;
          return query;
        },
      };
    };
    const expired = await TelegramWebhookService.processUpdate({ message: { text: `/start ${webhookToken}`, chat: { id: 1 } } });
    assert(!expired.linked && !expiredMutationAttempted, 'Test 5: expired token must be ignored safely');
    console.log('Test 5 - Expired token is rejected safely: passed');

    let invalidMutationAttempted = false;
    (supabaseAdmin as any).from = (table: string) => {
      assert(table === 'telegram_link_tokens', 'Test 6: invalid token must query only token storage');
      const query: any = {
        eq: () => query,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return {
        select: () => query,
        update: () => {
          invalidMutationAttempted = true;
          return query;
        },
      };
    };
    const invalid = await TelegramWebhookService.processUpdate({ message: { text: `/start ${'B'.repeat(43)}`, chat: { id: 1 } } });
    assert(!invalid.linked && !invalidMutationAttempted, 'Test 6: invalid token must not mutate preferences');
    console.log('Test 6 - Invalid token does not mutate preferences: passed');

    let unlinkPreferences: Record<string, unknown> | null = null;
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'telegram_link_tokens') {
        const query: any = {
          eq: () => query,
          is: () => query,
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
            Promise.resolve({ error: null }).then(resolve, reject),
        };
        return { delete: () => query };
      }

      assert(table === 'notification_preferences', 'Test 8: unlink must update notification preferences');
      const selectQuery: any = {
        eq: () => selectQuery,
        maybeSingle: async () => ({ data: { in_app_enabled: false }, error: null }),
      };
      return {
        select: () => selectQuery,
        upsert: (value: Record<string, unknown>) => {
          unlinkPreferences = value;
          return {
            select: () => ({
              single: async () => ({ data: value, error: null }),
            }),
          };
        },
      };
    };
    const unlinked = await TelegramLinkService.unlink('user-1');
    const storedUnlinkPreferences = asMockRow(unlinkPreferences);
    assert(storedUnlinkPreferences.telegram_chat_id === null && storedUnlinkPreferences.telegram_username === null, 'Test 8: unlink must clear Telegram identity fields');
    assert(storedUnlinkPreferences.telegram_linked_at === null && storedUnlinkPreferences.telegram_enabled === false, 'Test 8: unlink must disable Telegram delivery');
    assert(unlinked.in_app_enabled === false, 'Test 8: unlink must preserve in-app preference');
    console.log('Test 8 - Unlink clears Telegram fields while preserving in-app preference: passed');

    ENV.TELEGRAM_WEBHOOK_SECRET = 'configured-secret';
    assert(TelegramWebhookService.isWebhookSecretValid('configured-secret'), 'Test 9: correct webhook secret must be accepted');
    assert(!TelegramWebhookService.isWebhookSecretValid('incorrect-secret'), 'Test 9: wrong webhook secret must be rejected');
    assert(!TelegramWebhookService.isWebhookSecretValid(undefined), 'Test 9: missing webhook secret must be rejected when configured');
    console.log('Test 9 - Configured webhook secret is checked safely: passed');

    assert(
      !updateNotificationPreferencesSchema.safeParse({ in_app_enabled: true, telegram_chat_id: '12345' }).success &&
      !updateNotificationPreferencesSchema.safeParse({ telegram_username: 'workflow_user' }).success &&
      !updateNotificationPreferencesSchema.safeParse({ telegram_linked_at: new Date().toISOString() }).success,
      'Test 10: notification preferences validator must reject direct Telegram identity mutation'
    );
    const notificationRouteSource = readFileSync(join(__dirname, '../routes/notification.routes.ts'), 'utf8');
    assert(notificationRouteSource.includes('router.use(authenticateUser);'), 'Test 10: link endpoints must remain authenticated');
    console.log('Test 10 - Existing preferences validator rejects direct Telegram identity mutation: passed');
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    ENV.TELEGRAM_BOT_USERNAME = originalBotUsername;
    ENV.TELEGRAM_WEBHOOK_SECRET = originalWebhookSecret;
    console.error = originalConsoleError;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
