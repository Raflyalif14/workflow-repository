import assert from 'node:assert';
import { changePasswordWithDependencies, ChangePasswordDependencies } from './auth.service';

const currentPassword = 'OldStrongPassword123!';
const newPassword = 'NewStrongPassword456!';

const makeDeps = (overrides: Partial<ChangePasswordDependencies> = {}) => {
  const calls = {
    updated: [] as Array<{ userId: string; password: string }>,
  };

  const deps: ChangePasswordDependencies = {
    getUser: async (id) => ({ email: `${id}@example.com`, is_active: true }),
    verifyCurrentPassword: async (_email, password) => password === currentPassword,
    updateAuthPassword: async (userId, password) => {
      calls.updated.push({ userId, password });
    },
    ...overrides,
  };

  return { deps, calls };
};

async function runTests() {
  // Test 1: Successful password change
  {
    const { deps, calls } = makeDeps();
    const result = await changePasswordWithDependencies('user-1', {
      current_password: currentPassword,
      new_password: newPassword,
    }, deps);

    assert.equal(result.message, 'Password changed successfully.');
    assert.equal(calls.updated.length, 1);
    assert.equal(calls.updated[0].userId, 'user-1');
    assert.equal(calls.updated[0].password, newPassword);
    console.log('Test 1: Successful password change passed');
  }

  // Test 2: Rejects when current password is incorrect
  {
    const { deps, calls } = makeDeps();
    await assert.rejects(
      async () => changePasswordWithDependencies('user-1', {
        current_password: 'WrongPassword123!',
        new_password: newPassword,
      }, deps),
      /Current password is incorrect/
    );
    assert.equal(calls.updated.length, 0);
    console.log('Test 2: Incorrect current password rejection passed');
  }

  // Test 3: Rejects when new password equals current password
  {
    const { deps, calls } = makeDeps();
    await assert.rejects(
      async () => changePasswordWithDependencies('user-1', {
        current_password: currentPassword,
        new_password: currentPassword,
      }, deps),
      /New password must be different/
    );
    assert.equal(calls.updated.length, 0);
    console.log('Test 3: Identical new password rejection passed');
  }

  // Test 4: Rejects when new password does not meet policy
  {
    const { deps, calls } = makeDeps();
    await assert.rejects(
      async () => changePasswordWithDependencies('user-1', {
        current_password: currentPassword,
        new_password: 'weak',
      }, deps),
      /Password must be at least 12 characters/
    );
    assert.equal(calls.updated.length, 0);
    console.log('Test 4: Weak new password rejection passed');
  }

  // Test 5: Rejects when user is inactive or not found
  {
    const { deps, calls } = makeDeps({
      getUser: async () => null,
    });
    await assert.rejects(
      async () => changePasswordWithDependencies('user-missing', {
        current_password: currentPassword,
        new_password: newPassword,
      }, deps),
      /User not found or inactive/
    );
    assert.equal(calls.updated.length, 0);
    console.log('Test 5: Missing user rejection passed');
  }

  console.log('All auth change password tests passed.');
}

void runTests();

