import assert from 'node:assert/strict';
import { getLanguagePreferenceWithDependencies, updateLanguagePreferenceWithDependencies } from './auth.service';
import { updateLanguagePreferenceSchema } from '../validators/auth.validator';

async function run() {
  const requestedIds: string[] = [];
  assert.deepEqual(await getLanguagePreferenceWithDependencies('current-user', {
    getPreferredLanguage: async (userId) => { requestedIds.push(userId); return null; },
  }), { language: 'en' });
  assert.deepEqual(requestedIds, ['current-user']);

  const updates: Array<{ userId: string; language: string }> = [];
  assert.deepEqual(await updateLanguagePreferenceWithDependencies('current-user', { language: 'id' }, {
    updatePreferredLanguage: async (userId, language) => { updates.push({ userId, language }); return language; },
  }), { language: 'id' });
  assert.deepEqual(updates, [{ userId: 'current-user', language: 'id' }]);
  assert.equal(updateLanguagePreferenceSchema.safeParse({ language: 'en' }).success, true);
  assert.equal(updateLanguagePreferenceSchema.safeParse({ language: 'id' }).success, true);
  assert.equal(updateLanguagePreferenceSchema.safeParse({ language: 'fr' }).success, false);
}

void run().then(() => console.log('Auth language preference tests passed.'));
