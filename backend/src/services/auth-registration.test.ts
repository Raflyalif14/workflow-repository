import {
  generateInitialPassword,
  registerUserWithDependencies,
  RegisterDependencies,
  validateInitialPassword,
} from './auth.service';
import { buildInitialPasswordEmail } from './email.service';
import { validatePublicRegistrationRole } from '../config/env';
import { registerSchema } from '../validators/auth.validator';

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

const assertThrows = (name: string, action: () => unknown) => {
  try {
    action();
  } catch {
    console.log(`${name}: rejected`);
    return;
  }

  throw new Error(`${name}: expected rejection`);
};

const securePassword = 'Aa1!SecurePass99';

const createDeps = (overrides: Partial<RegisterDependencies> = {}) => {
  const calls = {
    publicDuplicateChecks: [] as string[],
    authCreates: [] as Array<{ email: string; password: string }>,
    authDeletes: [] as string[],
    publicCreates: [] as any[],
    publicDeletes: [] as string[],
    emails: [] as any[],
    timestampUpdates: [] as Array<{ userId: string; sentAt: string }>,
  };

  const deps: RegisterDependencies = {
    internalEmailDomain: 'r17.co.id',
    defaultRegisterRole: 'SA',
    findPublicUserByEmail: async (email) => {
      calls.publicDuplicateChecks.push(email);
      return false;
    },
    createAuthUser: async (email, password) => {
      calls.authCreates.push({ email, password });
      return { id: 'auth-user-1' };
    },
    deleteAuthUser: async (userId) => {
      calls.authDeletes.push(userId);
    },
    createPublicUser: async (input) => {
      calls.publicCreates.push(input);
      return {
        id: input.id,
        email: input.email,
        full_name: input.full_name,
        role: input.role,
        is_active: input.is_active,
        must_change_password: input.must_change_password,
        initial_password_sent_at: input.initial_password_sent_at,
      };
    },
    deletePublicUser: async (userId) => {
      calls.publicDeletes.push(userId);
    },
    sendInitialPasswordEmail: async (input) => {
      calls.emails.push(input);
    },
    updateInitialPasswordSentAt: async (userId, sentAt) => {
      calls.timestampUpdates.push({ userId, sentAt });
    },
    generatePassword: () => securePassword,
    now: () => '2026-08-27T00:00:00.000Z',
    ...overrides,
  };

  return { deps, calls };
};

async function run() {
  const test1 = createDeps();
  const registered = await registerUserWithDependencies(
    { full_name: 'User R17', email: 'User@R17.Co.Id' },
    test1.deps
  );
  assert(test1.calls.authCreates.length === 1, 'Test 1: Supabase Auth user should be created');
  assert(test1.calls.publicCreates.length === 1, 'Test 1: public.users row should be created');
  assert(test1.calls.publicCreates[0].role === 'SA', 'Test 1: role should use DEFAULT_REGISTER_ROLE');
  assert(test1.calls.publicCreates[0].must_change_password === true, 'Test 1: must_change_password should be true');
  assert(test1.calls.emails.length === 1, 'Test 1: SMTP should be called');
  assert(registered.email === 'user@r17.co.id', 'Test 1: email should be normalized');
  console.log('Test 1 - Valid internal email: Auth created, public.users created, role default, SMTP called');

  assert(validatePublicRegistrationRole(undefined) === 'SA', 'Test 1b: unset public registration role must default to SA');
  assert(validatePublicRegistrationRole('SA') === 'SA', 'Test 1b: SA public registration role must be accepted');
  for (const role of ['SUPER_ADMIN', 'SALES', 'HEAD_SA', 'UNEXPECTED', '']) {
    assertThrows(`Test 1b - Configured ${role} public registration role`, () =>
      validatePublicRegistrationRole(role)
    );
  }

  for (const role of ['SUPER_ADMIN', 'SALES', 'HEAD_SA']) {
    const privilegedRole = createDeps({ defaultRegisterRole: role as any });
    await assertThrowsAsync(`Test 1c - Direct ${role} public registration role`, () =>
      registerUserWithDependencies({ full_name: 'User R17', email: 'user@r17.co.id' }, privilegedRole.deps)
    );
    assert(privilegedRole.calls.authCreates.length === 0, `Test 1c: ${role} must not create an Auth user`);
    assert(privilegedRole.calls.publicCreates.length === 0, `Test 1c: ${role} must not create a public user`);
  }
  console.log('Test 1c - Privileged public registration defaults are rejected before user creation');

  const test2 = createDeps();
  await assertThrowsAsync('Test 2 - Non-internal email', () =>
    registerUserWithDependencies({ full_name: 'User Gmail', email: 'user@gmail.com' }, test2.deps)
  );
  assert(test2.calls.authCreates.length === 0, 'Test 2: Auth user should not be created');

  const test3 = createDeps({
    findPublicUserByEmail: async () => true,
  });
  await assertThrowsAsync('Test 3 - Duplicate email', () =>
    registerUserWithDependencies({ full_name: 'User R17', email: 'user@r17.co.id' }, test3.deps)
  );
  assert(test3.calls.authCreates.length === 0, 'Test 3: duplicate should not create Auth user');

  const test4 = createDeps();
  const registrationPayload = registerSchema.parse({
    full_name: 'User R17',
    email: 'user@r17.co.id',
    role: 'SUPER_ADMIN',
  });
  assert(!('role' in registrationPayload), 'Test 4: registerSchema must not expose a role field');
  await registerUserWithDependencies(
    registrationPayload,
    test4.deps
  );
  assert(test4.calls.publicCreates[0].role === 'SA', 'Test 4: request role must not determine the created role');
  console.log('Test 4 - registerSchema strips request role and public registration remains SA');

  const test5 = createDeps();
  await registerUserWithDependencies(
    { full_name: 'User R17', email: 'user@r17.co.id', password: 'FrontendPassword123!' } as any,
    test5.deps
  );
  assert(test5.calls.authCreates[0].password === securePassword, 'Test 5: backend generated password should be used');
  assert(test5.calls.authCreates[0].password !== 'FrontendPassword123!', 'Test 5: frontend password should not be used');
  console.log('Test 5 - Frontend password ignored: backend generated password used');

  const generatedPassword = generateInitialPassword();
  const passwordRules = validateInitialPassword(generatedPassword);
  assert(Object.values(passwordRules).every(Boolean), 'Test 6: generated password should satisfy all rules');
  console.log('Test 6 - Generated password meets length, uppercase, lowercase, number, and special rules');

  const test7 = createDeps({
    createPublicUser: async () => {
      throw new Error('Profile insert failed');
    },
  });
  await assertThrowsAsync('Test 7 - public.users insert failed after Auth create', () =>
    registerUserWithDependencies({ full_name: 'User R17', email: 'user@r17.co.id' }, test7.deps)
  );
  assert(test7.calls.authCreates.length === 1, 'Test 7: Auth user should be created first');
  assert(test7.calls.authDeletes[0] === 'auth-user-1', 'Test 7: Auth user should be deleted best effort');

  const test8 = createDeps({
    sendInitialPasswordEmail: async () => {
      throw new Error('SMTP mock failure');
    },
  });
  await assertThrowsAsync('Test 8 - SMTP failed', () =>
    registerUserWithDependencies({ full_name: 'User R17', email: 'user@r17.co.id' }, test8.deps)
  );
  assert(test8.calls.publicDeletes[0] === 'auth-user-1', 'Test 8: public.users row should be deleted');
  assert(test8.calls.authDeletes[0] === 'auth-user-1', 'Test 8: Auth user should be deleted');

  const test9 = createDeps();
  const sent = await registerUserWithDependencies({ full_name: 'User R17', email: 'user@r17.co.id' }, test9.deps);
  assert(test9.calls.timestampUpdates.length === 1, 'Test 9: initial_password_sent_at update should be called');
  assert(sent.must_change_password === true, 'Test 9: must_change_password should remain true');
  console.log('Test 9 - SMTP success: initial_password_sent_at update called, must_change_password remains true');

  const responseJson = JSON.stringify(sent);
  assert(!responseJson.includes(securePassword), 'Test 10: response must not contain initial password');
  assert(!('password' in sent), 'Test 10: response must not have password field');
  assert(!('initial_password' in sent), 'Test 10: response must not have initial_password field');
  console.log('Test 10 - Response does not contain plaintext initial password');

  assert(sent.must_change_password === true, 'Test 11: new users may login later but are flagged for Phase 7D-B enforcement');
  console.log('Test 11 - Login compatibility: registration only flags must_change_password, no enforcement added');

  const email = buildInitialPasswordEmail({
    recipientEmail: 'user@r17.co.id',
    recipientName: 'User R17',
    initialPassword: securePassword,
    loginUrl: 'http://localhost:3000/login',
  });
  assert(String(email.text).includes('user@r17.co.id'), 'Security Test: email body may include recipient email');
  assert(String(email.text).includes(securePassword), 'Security Test: SMTP email includes temporary password only in email payload');
  assert(!responseJson.includes(securePassword), 'Security Test: password should not appear in response JSON');
  console.log('Security Test - Initial password only appears in SMTP payload, not response or test output');
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
