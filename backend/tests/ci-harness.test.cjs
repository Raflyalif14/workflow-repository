'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const net = require('node:net');
const { once } = require('node:events');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { testEnvironment } = require('./test-environment.cjs');

async function main() {
  const clean = testEnvironment({ PATH: '/synthetic/bin', SUPABASE_URL: 'https://provider.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'private-do-not-inherit', SMTP_PASS: 'private-do-not-inherit',
    BACKUP_DATABASE_URL: 'private-do-not-inherit', NODE_OPTIONS: '--require malicious-preload.cjs' });
  assert.equal(clean.PATH, '/synthetic/bin');
  assert.equal(clean.SUPABASE_URL, 'http://127.0.0.1:1');
  assert(!JSON.stringify(clean).includes('private-do-not-inherit'));
  assert.equal(clean.NODE_OPTIONS, undefined);
  assert.equal(clean.SMTP_PASS, undefined);
  assert.equal(process.env.NODE_ENV, 'test');

  await assert.rejects(fetch('https://example.invalid/should-never-leave-process'), /loopback/);
  const socket = new net.Socket();
  try { assert.throws(() => socket.connect({ host: '192.0.2.1', port: 5432 }), /loopback/); }
  finally { socket.destroy(); }

  const server = http.createServer((_request, response) => response.end('owned-ci-server'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(await response.text(), 'owned-ci-server');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

  const syntheticPrivateFile = path.resolve(__dirname, '../../.private', 'ci-fixture-' + randomUUID() + '.txt');
  assert.equal(fs.existsSync(syntheticPrivateFile), false);
  await fs.promises.writeFile(syntheticPrivateFile, 'synthetic-private-fixture');
  assert.equal(await fs.promises.readFile(syntheticPrivateFile, 'utf8'), 'synthetic-private-fixture');
  assert.equal(fs.existsSync(syntheticPrivateFile), false, 'Fixture must never write to real .private');
  await fs.promises.rm(syntheticPrivateFile);

  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-backend-ci-harness-'));
  try {
    const envFile = path.join(fixture, '.env');
    fs.writeFileSync(envFile, 'CI_UNEXPECTED_ENV_FILE=should-not-load\n');
    assert.deepEqual(require('dotenv').config({ path: envFile }), { parsed: {} });
    assert.equal(process.env.CI_UNEXPECTED_ENV_FILE, undefined);
    const failingTest = path.join(fixture, 'failure.cjs');
    fs.writeFileSync(failingTest, "throw Error('synthetic-fixture-failure');\n");
    const result = spawnSync(process.execPath, [path.join(__dirname, 'run-one-ci.cjs'), failingTest], {
      cwd: path.resolve(__dirname, '..'), env: testEnvironment(process.env), encoding: 'utf8',
      timeout: 15000, windowsHide: true,
    });
    assert.equal(result.status, 1, 'Test errors must fail the child process');
    assert.match(result.stderr, /synthetic-fixture-failure/);
  } finally {
    const absolute = path.resolve(fixture);
    assert.equal(path.dirname(absolute), path.resolve(os.tmpdir()));
    assert(path.basename(absolute).startsWith('workflow-backend-ci-harness-'));
    fs.rmSync(absolute, { recursive: true, force: true });
  }
  console.log('CI harness: synthetic environment, no dotenv, external fetch/TCP blocked, loopback allowed, private store redirected, failures return nonzero.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
