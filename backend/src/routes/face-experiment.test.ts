import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const { startFixture } = require('../../tests/face-experiment-fixture.cjs');
async function run() {
  const fixture = await startFixture();
  const endpoint = fixture.origin + '/api/face-experiment';
  const a = fs.readFileSync(path.resolve('../services/face-experiment/tests/fixtures/same-person-a.jpg'));
  const b = fs.readFileSync(path.resolve('../services/face-experiment/tests/fixtures/same-person-b.jpg'));
  const form = (first = a, second = b, field = 'photoA') => { const body = new FormData(); body.append(field, new Blob([new Uint8Array(first)], { type: 'image/jpeg' }), 'a.jpg'); body.append('photoB', new Blob([new Uint8Array(second)], { type: 'image/jpeg' }), 'b.jpg'); return body; };
  const request = (body: FormData, actor = 'fixture-active') => fetch(endpoint + '/compare', { method: 'POST', headers: { Authorization: 'Bearer ' + actor }, body });
  try {
    assert.equal((await fetch(endpoint + '/compare', { method: 'POST', body: form() })).status, 401);
    assert.equal((await request(form(), 'inactive')).status, 401);
    assert.equal((await request(form(), 'password-required')).status, 403);
    delete process.env.FACE_EXPERIMENT_ENABLED;
    assert.equal((await request(form())).status, 404, 'Disabled by default, including production without explicit flag');
    process.env.FACE_EXPERIMENT_ENABLED = 'true';
    const response = await request(form()); assert.equal(response.status, 200);
    const data = await response.json(); assert.deepEqual(Object.keys(data.data).sort(), ['metric', 'model', 'provenance', 'score']);
    assert(Number.isFinite(data.data.score)); assert(!JSON.stringify(data).includes('embedding'));
    const concurrent = await Promise.all([request(form(), 'fixture-concurrent'), request(form(), 'fixture-concurrent')]);
    assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409], 'Same actor has one processing attempt at a time');
    assert.equal((await request(form(a, b, 'unexpected'))).status, 400);
    assert.equal((await request(form(Buffer.from('broken'), b))).status, 422);
    assert.equal((await request(form(Buffer.alloc(4 * 1024 * 1024 + 1), b))).status, 413);
    const internal = await fetch(fixture.pythonOrigin + '/health'); assert.equal(internal.status, 401, 'Python requires internal secret');
    for (let i = 0; i < 5; i++) await request(form(a, b, 'unexpected'), 'fixture-rate');
    for (let i = 0; i < 5; i++) await request(form(a, b, 'unexpected'), 'fixture-rate');
    assert.equal((await request(form(), 'fixture-rate')).status, 429);
    await fixture.stopPython(); assert.equal((await request(form(), 'fixture-dead')) .status, 503);
    const hanging = http.createServer((_req, _res) => {}); hanging.listen(0, '127.0.0.1'); await new Promise<void>(r => hanging.once('listening', r));
    try {
      process.env.FACE_EXPERIMENT_URL = 'http://127.0.0.1:' + (hanging.address() as any).port;
      const slowUpload = new Promise<void>((resolve, reject) => {
        const started = Date.now();
        const req = http.request(endpoint + '/compare', { method: 'POST', headers: { Authorization: 'Bearer fixture-slow', 'Content-Type': 'multipart/form-data; boundary=fixture' } });
        req.on('response', res => { res.resume(); reject(Error('Stalled upload unexpectedly reached a response')); });
        req.write('--fixture\r\nContent-Disposition: form-data; name="photoA"; filename="a.png"\r\nContent-Type: image/png\r\n\r\nx');
        const keepAlive = setInterval(() => req.write('x'), 200); // Never idle: proves absolute upload deadline.
        req.on('error', () => { clearInterval(keepAlive); assert(Date.now() - started < 18000); resolve(); });
      });
      const timeout = await request(form(), 'fixture-timeout'); assert.equal(timeout.status, 504); assert.equal((await timeout.json()).errors.code, 'FACE_TIMEOUT');
      await slowUpload;
    } finally { hanging.closeAllConnections(); await new Promise<void>(r => hanging.close(() => r())); }
    console.log('Face experiment actual HTTP: auth/inactive/password/default off, real Node->Python model, safe projection, parser/file limits, rate limit, internal auth and dead service passed');
  } finally { await fixture.close(); }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
