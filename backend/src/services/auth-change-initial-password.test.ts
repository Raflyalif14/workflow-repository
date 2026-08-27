import { Response } from 'express';
import {
  buildLoginResult,
  changeInitialPasswordWithDependencies,
  ChangeInitialPasswordDependencies,
} from './auth.service';
import { AuthenticatedRequest, requirePasswordChanged } from '../middlewares/auth.middleware';

const strongPassword = 'NewStrongPassword123!';

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const assertThrowsAsync = async (name: string, action: () => Promise<unknown>) => {
  try {
    await action();
  } catch {
    console.log(`${name}: rejected`);
    return;
  }

  throw new Error(`${name}: expected rejection`);
};

const makeDeps = (mustChangePassword: boolean, overrides: Partial<ChangeInitialPasswordDependencies> = {}) => {
  const calls = {
    authUpdates: [] as Array<{ userId: string; password: string }>,
    flagUpdates: [] as string[],
  };

  const deps: ChangeInitialPasswordDependencies = {
    getUserPasswordFlag: async () => mustChangePassword,
    updateAuthPassword: async (userId, password) => {
      calls.authUpdates.push({ userId, password });
    },
    updateMustChangePassword: async (userId) => {
      calls.flagUpdates.push(userId);
    },
    ...overrides,
  };

  return { deps, calls };
};

const runPasswordMiddleware = (mustChangePassword: boolean, originalUrl: string) => {
  let nextCalled = false;
  let statusCode = 200;
  let payload: any = null;
  const req = {
    originalUrl,
    user: {
      userId: 'user-1',
      email: 'user@test.com',
      role: 'SA',
      fullName: 'User Test',
      isActive: true,
      must_change_password: mustChangePassword,
      mustChangePassword,
    },
  } as AuthenticatedRequest;
  const res = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (body: any) => {
      payload = body;
      return res;
    },
  } as unknown as Response;

  requirePasswordChanged(req, res, () => {
    nextCalled = true;
  });

  return { nextCalled, statusCode, payload };
};

async function run() {
  const login = buildLoginResult(
    {
      id: 'user-1',
      email: 'userregister01@test.com',
      full_name: 'User Register Test',
      role: 'SA',
      is_active: true,
      must_change_password: true,
      created_at: '2026-08-27T00:00:00.000Z',
      updated_at: '2026-08-27T00:00:00.000Z',
    },
    { access_token: 'access-token', refresh_token: 'refresh-token' }
  );
  assert(login.accessToken === 'access-token', 'Test 1: accessToken should be returned');
  assert(login.user.must_change_password === true, 'Test 1: user.must_change_password should be true');
  console.log('Test 1 - must_change_password=true login: success response includes accessToken and flag');

  const blocked = runPasswordMiddleware(true, '/api/projects');
  assert(blocked.nextCalled === false, 'Test 2: normal endpoint should be blocked');
  assert(blocked.statusCode === 403, 'Test 2: normal endpoint should return 403');
  assert(blocked.payload.message.includes('must change'), 'Test 2: response should mention password change');
  console.log('Test 2 - Temporary user accessing normal endpoint: 403 must change password');

  const me = runPasswordMiddleware(true, '/api/auth/me');
  assert(me.nextCalled === true, 'Test 3: /api/auth/me should be allowed');
  console.log('Test 3 - Temporary user accessing /api/auth/me: allowed');

  const test4 = makeDeps(true);
  const changed = await changeInitialPasswordWithDependencies(
    'user-1',
    { new_password: strongPassword },
    test4.deps
  );
  assert(test4.calls.authUpdates[0].userId === 'user-1', 'Test 4: Supabase Auth target should be authenticated user');
  assert(test4.calls.flagUpdates[0] === 'user-1', 'Test 4: public.users flag should be updated for authenticated user');
  assert(changed.must_change_password === false, 'Test 4: response flag should be false');
  console.log('Test 4 - Valid change initial password: Auth update called, must_change_password=false');

  const test5 = makeDeps(true);
  await assertThrowsAsync('Test 5 - Weak password', () =>
    changeInitialPasswordWithDependencies('user-1', { new_password: 'weak' }, test5.deps)
  );
  assert(test5.calls.authUpdates.length === 0, 'Test 5: weak password should not update Auth');
  assert(test5.calls.flagUpdates.length === 0, 'Test 5: weak password should keep flag true');

  const test6 = makeDeps(false);
  await assertThrowsAsync('Test 6 - already changed password', () =>
    changeInitialPasswordWithDependencies('user-1', { new_password: strongPassword }, test6.deps)
  );
  assert(test6.calls.authUpdates.length === 0, 'Test 6: already changed user should not update Auth');

  const test7 = makeDeps(true);
  await changeInitialPasswordWithDependencies(
    'authenticated-user',
    { new_password: strongPassword, user_id: 'other-user' } as any,
    test7.deps
  );
  assert(test7.calls.authUpdates[0].userId === 'authenticated-user', 'Test 7: frontend user_id should be ignored');
  console.log('Test 7 - Frontend user_id ignored: authenticated user remains source of truth');

  const allowedAfterChange = runPasswordMiddleware(false, '/api/projects');
  assert(allowedAfterChange.nextCalled === true, 'Test 8: normal endpoint should be allowed after password change');
  console.log('Test 8 - After password changed, normal endpoint can be accessed');

  const existingLogin = buildLoginResult(
    {
      id: 'existing-user',
      email: 'sa@test.com',
      full_name: 'Existing SA',
      role: 'SA',
      is_active: true,
      must_change_password: false,
      created_at: '2026-08-27T00:00:00.000Z',
      updated_at: '2026-08-27T00:00:00.000Z',
    },
    { access_token: 'existing-token', refresh_token: 'existing-refresh' }
  );
  assert(existingLogin.user.must_change_password === false, 'Test 9: existing users should have false flag');
  assert(runPasswordMiddleware(false, '/api/projects').nextCalled === true, 'Test 9: existing users should access normal endpoint');
  console.log('Test 9 - Existing users must_change_password=false: login and normal endpoint still work');

  const responseJson = JSON.stringify(changed);
  assert(!responseJson.includes(strongPassword), 'Test 10: response should not include new password');
  assert(!('password' in changed), 'Test 10: response should not include password field');
  console.log('Test 10 - New password does not appear in response or test output');
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
