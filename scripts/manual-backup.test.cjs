'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { encrypt, verifyEntry, inside, databaseEnvironment } = require('./manual-backup.cjs');
test('database connection uses explicit libpq fields without credentials in arguments', () => {
  const env = databaseEnvironment('postgresql://postgres.example:test%40password@db.example.test:5432/postgres', { PGHOST: 'localhost' });
  assert.equal(env.PGHOST, 'db.example.test');
  assert.equal(env.PGUSER, 'postgres.example');
  assert.equal(env.PGPASSWORD, 'test@password');
  assert.equal(env.PGDATABASE, 'postgres');
  assert.equal(env.PGPORT, '5432');
  assert.equal(env.PGSSLMODE, 'require');
  assert.throws(() => databaseEnvironment('https://invalid.example'));
});
test('backup encryption preserves bytes and rejects wrong key, tampering and unsafe paths', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-backup-test-'));
  const key = crypto.randomBytes(32), payload = crypto.randomBytes(131073);
  try {
    const file = 'fixture.enc';
    const metadata = await encrypt(Readable.from([payload.subarray(0, 65536), payload.subarray(65536)]), path.join(base, file), key);
    const entry = { file, kind: 'fixture', ...metadata };
    assert.equal(metadata.bytes, payload.length);
    assert.equal(metadata.sha256, crypto.createHash('sha256').update(payload).digest('hex'));
    await verifyEntry(base, entry, key);
    await assert.rejects(verifyEntry(base, entry, crypto.randomBytes(32)));
    await assert.rejects(verifyEntry(base, { ...entry, sha256: '0'.repeat(64) }, key));
    await assert.rejects(verifyEntry(base, { ...entry, bytes: 1 }, key));
    for (const value of ['../escape', path.resolve(base, '..', 'escape'), '']) assert.throws(() => inside(base, value));
    const changed = await fs.readFile(path.join(base, file)); changed[0] ^= 1;
    await fs.writeFile(path.join(base, file), changed);
    await assert.rejects(verifyEntry(base, entry, key));
    await assert.rejects(encrypt(Readable.from([payload]), path.join(base, file), key));
  } finally {
    key.fill(0); payload.fill(0);
    // Only this test-owned file and empty temporary directory are removed.
    await fs.unlink(path.join(base, 'fixture.enc')).catch(() => {}); await fs.rmdir(base);
  }
});
