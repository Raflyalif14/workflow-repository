import { readFileSync } from 'fs';
import { join } from 'path';
import { supabaseAdmin } from '../config/supabase';
import {
  createUserSchema,
  updateUserSchema,
  updateUserStatusSchema,
} from '../validators/user.validator';
import {
  AdminUserCreationDependencies,
  createAdminUserWithDependencies,
  UserService,
  UserServiceError,
} from './user.service';
import { validateInitialPassword } from './auth.service';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const input = {
  email: '  new.user@company.com  ',
  fullName: '  New User  ',
  role: 'HEAD_SA' as const,
  isActive: false,
};

const makePublicUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-1',
  email: 'new.user@company.com',
  full_name: 'New User',
  role: 'HEAD_SA' as const,
  is_active: false,
  must_change_password: true,
  created_at: '2026-09-02T00:00:00.000Z',
  updated_at: '2026-09-02T00:00:00.000Z',
  ...overrides,
});

const createDependencies = (
  overrides: Partial<AdminUserCreationDependencies> = {}
): AdminUserCreationDependencies => ({
  internalEmailDomain: 'company.com',
  findPublicUserByEmail: async () => false,
  createAuthUser: async () => ({ id: 'user-1' }),
  deleteAuthUser: async () => undefined,
  createPublicUser: async () => makePublicUser(),
  deletePublicUser: async () => undefined,
  sendInitialPasswordEmail: async () => undefined,
  updateInitialPasswordSentAt: async () => undefined,
  generatePassword: () => 'Asecure1!Password',
  now: () => '2026-09-02T00:05:00.000Z',
  ...overrides,
});

const expectSafeFailure = async (promise: Promise<unknown>, message: string): Promise<UserServiceError> => {
  try {
    await promise;
    throw new Error('Expected user creation to fail.');
  } catch (error) {
    assert(error instanceof UserServiceError, 'Expected a safe UserServiceError');
    const serviceError = error as UserServiceError;
    assert(serviceError.message === message, `Expected safe error message: ${message}`);
    return serviceError;
  }
};

async function run(): Promise<void> {
  const originalFrom = supabaseAdmin.from;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  try {
    const parsedCreateInput = createUserSchema.parse({
      email: input.email,
      fullName: input.fullName,
      role: input.role,
      isActive: input.isActive,
    });
    assert(!('password' in parsedCreateInput), 'Test 1: create-user input must not require or contain a frontend password');
    assert(!createUserSchema.safeParse({ ...input, password: 'legacy-password' }).success, 'Test 1: legacy password input must be rejected');

    let authPassword = '';
    let emailPassword = '';
    const publicInsert: { current: Record<string, unknown> | null } = { current: null };
    const sentAtUpdate: { current: { userId: string; sentAt: string } | null } = { current: null };
    const sensitiveLogs: string[] = [];
    console.error = (...args: unknown[]) => sensitiveLogs.push(args.join(' '));
    console.warn = (...args: unknown[]) => sensitiveLogs.push(args.join(' '));
    const created = await createAdminUserWithDependencies(
      parsedCreateInput,
      createDependencies({
        createAuthUser: async (email, password) => {
          assert(email === 'new.user@company.com', 'Test 1: email must be normalized before Auth creation');
          authPassword = password;
          return { id: 'user-1' };
        },
        createPublicUser: async (value) => {
          publicInsert.current = value;
          return makePublicUser();
        },
        sendInitialPasswordEmail: async (emailInput) => {
          emailPassword = emailInput.initialPassword;
        },
        updateInitialPasswordSentAt: async (userId, sentAt) => {
          sentAtUpdate.current = { userId, sentAt };
        },
      })
    );
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    assert(
      authPassword === emailPassword &&
        Object.values(validateInitialPassword(authPassword)).every(Boolean) &&
        authPassword.length >= 12,
      'Test 1: backend-generated password must meet policy and be used only by Auth plus initial email'
    );
    assert(
      publicInsert.current?.must_change_password === true &&
        publicInsert.current?.initial_password_sent_at === null &&
        publicInsert.current?.role === 'HEAD_SA' &&
        publicInsert.current?.is_active === false,
      'Test 1: profile insert must preserve selected role/status and initialize password security fields'
    );
    assert(
      sentAtUpdate.current?.userId === 'user-1' && sentAtUpdate.current?.sentAt === '2026-09-02T00:05:00.000Z',
      'Test 1: successful initial email must attempt initial_password_sent_at update'
    );
    assert(
      created.mustChangePassword === true &&
        !JSON.stringify(created).includes(authPassword) &&
        sensitiveLogs.every((entry) => !entry.includes(authPassword)),
      'Test 1: initial password must never be returned or logged'
    );
    console.log('Test 1 - Admin user creation generates and confines a secure backend-only initial password: passed');

    const timestampWarnings: string[] = [];
    console.warn = (...args: unknown[]) => timestampWarnings.push(args.join(' '));
    const timestampFailureResult = await createAdminUserWithDependencies(
      parsedCreateInput,
      createDependencies({
        updateInitialPasswordSentAt: async () => {
          throw new Error('raw timestamp database detail');
        },
      })
    );
    console.warn = originalConsoleWarn;
    assert(
      timestampFailureResult.id === 'user-1' &&
        timestampWarnings.every((entry) => !entry.includes('raw timestamp database detail')),
      'Test 2: timestamp update failure must keep the successfully emailed account and log generically'
    );
    console.log('Test 2 - Timestamp update failure remains best-effort after successful email: passed');

    let deletedAuthUserId: string | null = null;
    await expectSafeFailure(
      createAdminUserWithDependencies(
        parsedCreateInput,
        createDependencies({
          createPublicUser: async () => {
            throw new Error('raw profile database detail');
          },
          deleteAuthUser: async (userId) => {
            deletedAuthUserId = userId;
          },
        })
      ),
      'Failed to create user.'
    );
    assert(deletedAuthUserId === 'user-1', 'Test 3: public profile failure must compensate the Auth user');
    console.log('Test 3 - Public profile failure compensates Auth and returns a safe error: passed');

    let deletedPublicUserId: string | null = null;
    deletedAuthUserId = null;
    await expectSafeFailure(
      createAdminUserWithDependencies(
        parsedCreateInput,
        createDependencies({
          sendInitialPasswordEmail: async () => {
            throw new Error('raw SMTP credential detail');
          },
          deletePublicUser: async (userId) => {
            deletedPublicUserId = userId;
          },
          deleteAuthUser: async (userId) => {
            deletedAuthUserId = userId;
          },
        })
      ),
      'Failed to create user.'
    );
    assert(
      deletedPublicUserId === 'user-1' && deletedAuthUserId === 'user-1',
      'Test 4: initial email failure must compensate both public and Auth users'
    );
    console.log('Test 4 - Initial email failure compensates both records and stays generic: passed');

    let duplicateAuthCalled = false;
    await expectSafeFailure(
      createAdminUserWithDependencies(
        parsedCreateInput,
        createDependencies({
          findPublicUserByEmail: async () => true,
          createAuthUser: async () => {
            duplicateAuthCalled = true;
            return { id: 'unexpected' };
          },
        })
      ),
      'Email is already registered.'
    );
    assert(!duplicateAuthCalled, 'Test 5: duplicate public email must not create another Auth user');
    await expectSafeFailure(
      createAdminUserWithDependencies({ ...parsedCreateInput, email: 'external@example.com' }, createDependencies()),
      'Email must use the internal company domain.'
    );
    console.log('Test 5 - Duplicate and external emails return safe client-facing errors: passed');

    assert(updateUserStatusSchema.safeParse({ isActive: false }).success, 'Test 6: boolean false must be valid status input');
    assert(updateUserStatusSchema.safeParse({ isActive: true }).success, 'Test 6: boolean true must be valid status input');
    assert(!updateUserStatusSchema.safeParse({ isActive: 'false' }).success, 'Test 6: string false must be rejected');
    assert(!updateUserStatusSchema.safeParse({ isActive: 'true' }).success, 'Test 6: string true must be rejected');
    assert(
      !updateUserSchema.safeParse({ must_change_password: false }).success &&
        !updateUserSchema.safeParse({ email: 'mutation@company.com' }).success,
      'Test 6: generic update input must reject sensitive or arbitrary fields'
    );
    console.log('Test 6 - Status validator preserves booleans and update schema rejects sensitive fields: passed');

    const statusUpdate: { current: Record<string, unknown> | null } = { current: null };
    (supabaseAdmin as any).from = (table: string) => {
      assert(table === 'users', 'Test 7: status update must use users table');
      const chain: any = {
        update: (value: Record<string, unknown>) => {
          statusUpdate.current = value;
          return chain;
        },
        eq: () => chain,
        select: () => chain,
        maybeSingle: async () => ({ data: makePublicUser(), error: null }),
      };
      return chain;
    };
    const inactiveUser = await UserService.updateStatus('user-1', false);
    assert(
      statusUpdate.current?.is_active === false && inactiveUser.isActive === false,
      'Test 7: JSON boolean false must remain false through the status update'
    );
    console.log('Test 7 - Status update preserves a false boolean: passed');

    (supabaseAdmin as any).from = (table: string) => {
      assert(table === 'users', 'Test 8: list users must use users table');
      const chain: any = {
        select: () => chain,
        range: () => chain,
        order: () => chain,
        eq: () => chain,
        or: () => chain,
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve({
            data: [{ ...makePublicUser(), initial_password_sent_at: '2026-09-02T00:05:00.000Z', raw_secret: 'do-not-return' }],
            error: null,
            count: 1,
          }).then(resolve, reject),
      };
      return chain;
    };
    const listedUsers = await UserService.listUsers({ page: 1, limit: 10 });
    const listedUserSerialized = JSON.stringify(listedUsers.users[0]);
    assert(
      listedUsers.users[0]?.mustChangePassword === true &&
        !listedUserSerialized.includes('initial_password_sent_at') &&
        !listedUserSerialized.includes('do-not-return'),
      'Test 8: list users must expose mustChangePassword but no sensitive profile fields'
    );
    console.log('Test 8 - User list exposes mustChangePassword without sensitive fields: passed');

    const safeErrors: string[] = [];
    console.error = (...args: unknown[]) => safeErrors.push(args.join(' '));
    (supabaseAdmin as any).from = () => {
      const chain: any = {
        select: () => chain,
        range: () => chain,
        order: () => chain,
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve({ data: null, error: { message: 'raw Supabase service-role detail' }, count: null }).then(resolve, reject),
      };
      return chain;
    };
    await expectSafeFailure(UserService.listUsers({ page: 1, limit: 10 }), 'Failed to retrieve users.');
    console.error = originalConsoleError;
    assert(
      safeErrors.every((entry) => !entry.includes('raw Supabase service-role detail')),
      'Test 9: raw Supabase errors must not be exposed through user service logs'
    );
    console.log('Test 9 - User service turns raw Supabase errors into safe generic failures: passed');

    const migration = readFileSync(join(__dirname, '../../supabase/phase11a-auth-user-hardening.sql'), 'utf8').toLowerCase();
    assert(
      migration.includes('add column if not exists must_change_password boolean not null default false') &&
        migration.includes('add column if not exists initial_password_sent_at timestamptz null'),
      'Test 10: schema reconciliation migration must safely add the current runtime columns'
    );
    console.log('Test 10 - Phase 11A migration contains idempotent security-column reconciliation: passed');
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
