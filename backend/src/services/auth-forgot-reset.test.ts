import {
  buildForgotPasswordResponse,
  buildPasswordResetUrl,
  forgotPasswordWithDependencies,
  ForgotPasswordDependencies,
  resetPasswordWithDependencies,
  ResetPasswordDependencies,
} from './auth.service';
import { buildPasswordResetEmail } from './email.service';

const strongPassword = 'AnotherStrongPassword123!';
const tokenHash = 'token-hash-secret';

const activeUser = {
  id: 'user-1',
  email: 'user@r17.co.id',
  full_name: 'User Register Test',
  is_active: true,
  must_change_password: false,
};

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

const createForgotDeps = (overrides: Partial<ForgotPasswordDependencies> = {}) => {
  const calls = {
    lookups: [] as string[],
    recoveryGenerates: [] as string[],
    emails: [] as any[],
  };

  const deps: ForgotPasswordDependencies = {
    internalEmailDomain: 'r17.co.id',
    passwordResetUrl: 'http://localhost:3000/reset-password',
    findPublicUserByEmail: async (email) => {
      calls.lookups.push(email);
      return activeUser;
    },
    generateRecoveryTokenHash: async (email) => {
      calls.recoveryGenerates.push(email);
      return tokenHash;
    },
    sendPasswordResetEmail: async (email) => {
      calls.emails.push(email);
    },
    ...overrides,
  };

  return { deps, calls };
};

const createResetDeps = (overrides: Partial<ResetPasswordDependencies> = {}) => {
  const calls = {
    verifications: [] as string[],
    userLookups: [] as string[],
    authUpdates: [] as Array<{ userId: string; password: string }>,
    flagUpdates: [] as string[],
  };

  const deps: ResetPasswordDependencies = {
    verifyRecoveryToken: async (hash) => {
      calls.verifications.push(hash);
      return { userId: 'user-1' };
    },
    getPublicUserById: async (userId) => {
      calls.userLookups.push(userId);
      return activeUser;
    },
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

async function run() {
  const test1 = createForgotDeps();
  const forgotActive = await forgotPasswordWithDependencies({ email: ' User@R17.Co.Id ' }, test1.deps);
  assert(test1.calls.recoveryGenerates[0] === activeUser.email, 'Test 1: recovery generate should use normalized email');
  assert(test1.calls.emails.length === 1, 'Test 1: SMTP reset email should be called');
  assert(forgotActive.message === buildForgotPasswordResponse().message, 'Test 1: response should be generic');
  console.log('Test 1 - Active internal user forgot-password: recovery generated, SMTP called, generic success');

  const test2 = createForgotDeps({ findPublicUserByEmail: async () => null });
  const forgotMissing = await forgotPasswordWithDependencies({ email: 'missing@r17.co.id' }, test2.deps);
  assert(forgotMissing.message === forgotActive.message, 'Test 2: unregistered response should be generic and equivalent');
  assert(test2.calls.recoveryGenerates.length === 0, 'Test 2: missing user should not generate recovery token');
  assert(test2.calls.emails.length === 0, 'Test 2: missing user should not send email');
  console.log('Test 2 - Unregistered email: generic success, no recovery/email');

  const test3 = createForgotDeps();
  const forgotExternal = await forgotPasswordWithDependencies({ email: 'user@gmail.com' }, test3.deps);
  assert(forgotExternal.message === forgotActive.message, 'Test 3: external response should be generic and equivalent');
  assert(test3.calls.lookups.length === 0, 'Test 3: external email should not lookup user');
  assert(test3.calls.recoveryGenerates.length === 0, 'Test 3: external email should not generate recovery');
  console.log('Test 3 - External email: generic success, no lookup/recovery/email');

  const test4 = createForgotDeps({ findPublicUserByEmail: async () => ({ ...activeUser, is_active: false }) });
  await forgotPasswordWithDependencies({ email: activeUser.email }, test4.deps);
  assert(test4.calls.recoveryGenerates.length === 0, 'Test 4: inactive user should not generate recovery');
  assert(test4.calls.emails.length === 0, 'Test 4: inactive user should not receive email');
  console.log('Test 4 - Inactive user forgot-password: generic success, no email');

  const test5 = createForgotDeps({
    generateRecoveryTokenHash: async () => {
      throw new Error('Supabase generate mock failure');
    },
  });
  const generateFailure = await forgotPasswordWithDependencies({ email: activeUser.email }, test5.deps);
  assert(generateFailure.message === forgotActive.message, 'Test 5: generate failure should return generic response');
  assert(test5.calls.emails.length === 0, 'Test 5: generate failure should not send email');
  console.log('Test 5 - Supabase recovery generate error: safe generic response');

  const test6 = createForgotDeps({
    sendPasswordResetEmail: async () => {
      throw new Error('SMTP mock failure');
    },
  });
  const smtpFailure = await forgotPasswordWithDependencies({ email: activeUser.email }, test6.deps);
  assert(smtpFailure.message === forgotActive.message, 'Test 6: SMTP failure should return generic response');
  assert(test6.calls.recoveryGenerates.length === 1, 'Test 6: recovery can be generated before SMTP failure');
  console.log('Test 6 - SMTP reset email failure: generic response, no account mutation');

  const test7 = createResetDeps();
  const reset = await resetPasswordWithDependencies(
    { token_hash: tokenHash, new_password: strongPassword },
    test7.deps
  );
  assert(test7.calls.verifications[0] === tokenHash, 'Test 7: recovery token should be verified');
  assert(test7.calls.authUpdates[0].userId === activeUser.id, 'Test 7: verified user ID should be used for Auth update');
  assert(test7.calls.flagUpdates[0] === activeUser.id, 'Test 7: must_change_password flag should be updated');
  assert(reset.message === 'Password reset successfully.', 'Test 7: reset response message mismatch');
  console.log('Test 7 - Valid recovery token + strong password: Auth updated, must_change_password=false');

  const test8 = createResetDeps({
    verifyRecoveryToken: async () => {
      throw new Error('Invalid token');
    },
  });
  await assertThrowsAsync('Test 8 - Invalid or expired recovery token', () =>
    resetPasswordWithDependencies({ token_hash: 'invalid-token', new_password: strongPassword }, test8.deps)
  );
  assert(test8.calls.authUpdates.length === 0, 'Test 8: invalid token should not update Auth');

  const test9 = createResetDeps();
  await assertThrowsAsync('Test 9 - Weak password', () =>
    resetPasswordWithDependencies({ token_hash: tokenHash, new_password: 'weak' }, test9.deps)
  );
  assert(test9.calls.authUpdates.length === 0, 'Test 9: weak password should not update Auth');

  const test10 = createResetDeps({
    verifyRecoveryToken: async () => ({ userId: 'verified-user' }),
  });
  await resetPasswordWithDependencies(
    { token_hash: tokenHash, new_password: strongPassword, user_id: 'OTHER_USER' } as any,
    test10.deps
  );
  assert(test10.calls.authUpdates[0].userId === 'verified-user', 'Test 10: request user_id must be ignored');
  console.log('Test 10 - Frontend user_id ignored: verified token user is source of truth');

  const test11 = createResetDeps({
    getPublicUserById: async () => ({ ...activeUser, is_active: false }),
  });
  await assertThrowsAsync('Test 11 - Verified user inactive', () =>
    resetPasswordWithDependencies({ token_hash: tokenHash, new_password: strongPassword }, test11.deps)
  );
  assert(test11.calls.authUpdates.length === 0, 'Test 11: inactive user should not update Auth');

  const responseJson = JSON.stringify(reset);
  assert(!responseJson.includes(strongPassword), 'Test 12: success response should not contain new password');
  assert(!responseJson.includes(tokenHash), 'Test 12: success response should not contain token_hash');
  assert(!responseJson.includes('access_token'), 'Test 12: success response should not contain Supabase session');
  console.log('Test 12 - Reset success response contains no password, token_hash, or session');

  const test13 = createResetDeps({
    getPublicUserById: async (userId) => ({ ...activeUser, id: userId, must_change_password: true }),
  });
  await resetPasswordWithDependencies({ token_hash: tokenHash, new_password: strongPassword }, test13.deps);
  assert(test13.calls.flagUpdates[0] === activeUser.id, 'Test 13: must_change_password=true user should be set false');
  console.log('Test 13 - Reset user with must_change_password=true: flag update called to false');

  const resetUrl = buildPasswordResetUrl('http://localhost:3000/reset-password', tokenHash);
  const email = buildPasswordResetEmail({
    recipientEmail: activeUser.email,
    recipientName: activeUser.full_name,
    resetUrl,
  });
  assert(String(email.text).includes('reset password'), 'Security Test: reset email body should describe reset');
  assert(forgotActive.message === forgotMissing.message && forgotMissing.message === forgotExternal.message, 'Security Test: forgot anti-enumeration responses should match');
  assert(!responseJson.includes(tokenHash) && !responseJson.includes(strongPassword), 'Security Test: reset response should not leak token or password');
  console.log('Security Test - No password/token in responses; forgot responses are equivalent');
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
