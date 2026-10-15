import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
const { startPadFixture } = require('../../tests/face-pad-fixture.cjs');
async function run() {
  const fixture = await startPadFixture(), url = fixture.origin + '/api/face-pad';
  const photo = fs.readFileSync(path.resolve('../services/face-experiment/tests/fixtures/same-person-a.jpg'));
  const form = (content = photo, slot = 'A', id = crypto.randomUUID(), field = 'photo') => {
    const body = new FormData(); body.append(field, new Blob([new Uint8Array(content)], { type: 'image/jpeg' }), 'fixture.jpg'); body.append('slot', slot); body.append('requestId', id); return body;
  };
  const request = (body: FormData, actor = 'fixture-active') => fetch(url + '/inspect', { method: 'POST', headers: { Authorization: 'Bearer ' + actor }, body });
  try {
    assert.equal((await fetch(url + '/inspect', { method: 'POST', body: form() })).status, 401);
    assert.equal((await request(form(), 'invalid')).status, 401);
    assert.equal((await request(form(), 'inactive')).status, 401);
    assert.equal((await request(form(), 'password-required')).status, 403);
    delete process.env.FACE_PAD_ENABLED;
    assert.equal((await request(form())).status, 404);
    process.env.FACE_PAD_ENABLED = 'true';
    const id = crypto.randomUUID(), response = await request(form(photo, 'B', id));
    assert.equal(response.status, 200); const v = (await response.json()).data;
    assert.equal(v.requestId, id); assert.equal(v.slot, 'B'); assert.equal(v.prediction, null);
    assert.equal(v.provenance.model, 'anti-spoof-mn3'); assert.equal(v.provenance.cropVersion, 'yunet-max-side-square-context-1.2-clip-v1');
    assert.equal(v.imageSha256, crypto.createHash('sha256').update(photo).digest('hex'));
    assert(Math.abs(v.probabilities.real + v.probabilities.spoof - 1) < 1e-5);
    assert(!('score' in v) && !('embedding' in v), 'No SFace score/embedding in PAD response');
    assert.equal(v.diagnostics.version, 'pad-geometry-v1'); assert.equal(v.diagnostics.faceCount, 1);
    assert(v.diagnostics.bbox.confidence >= .9); assert(v.diagnostics.frame.width >= 128);
    assert.equal(v.diagnostics.roi.width, v.diagnostics.cropAfterClip.right - v.diagnostics.cropAfterClip.left);
    assert.equal(v.diagnostics.roi.height, v.diagnostics.cropAfterClip.bottom - v.diagnostics.cropAfterClip.top);
    assert.equal((await request(form(Buffer.from('invalid')))).status, 422);
    const group = fs.readFileSync(path.resolve('../services/face-experiment/tests/fixtures/group-source.jpg'));
    const multi = await request(form(group), 'fixture-multi'); assert.equal(multi.status, 422);
    const multiError = (await multi.json()).errors; assert.equal(multiError.code, 'FACE_MULTIPLE'); assert(!('probabilities' in multiError));
    assert(multiError.diagnostics.faceCount > 1); assert.equal(multiError.diagnostics.bbox, null);
    assert.equal(multiError.diagnostics.cropAfterClip, null); assert(multiError.diagnostics.frame.width > 0);
    assert.equal((await request(form(photo, 'C'))).status, 400);
    assert.equal((await request(form(photo, 'A', 'bad-id' as any))).status, 400);
    assert.equal((await request(form(photo, 'A', crypto.randomUUID(), 'crop'))).status, 400);
    assert.equal((await request(form(Buffer.alloc(4 * 1024 * 1024 + 1)), 'fixture-limit')).status, 413);
    const concurrent = await Promise.all([request(form(), 'fixture-race'), request(form(), 'fixture-race')]);
    assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
    assert.equal((await fetch(fixture.pythonOrigin + '/health')).status, 401);
    for (let n = 0; n < 12; n++) await request(form(photo, 'C'), 'fixture-rate');
    assert.equal((await request(form(), 'fixture-rate')).status, 429);
    await fixture.stopPython(); assert.equal((await request(form(), 'fixture-dead')).status, 503);
    let mockMode = 'stale';
    const mock = http.createServer(async (req, res) => {
      const parts = []; for await (const p of req) parts.push(p);
      const body = Buffer.concat(parts), size = body.readUInt32BE(), meta = JSON.parse(body.subarray(4, 4 + size).toString());
      res.setHeader('Content-Type', 'application/json');
      // A stale response cannot be presented as a result for this capture/request.
      res.end(JSON.stringify({ ...v, requestId: mockMode === 'stale' ? crypto.randomUUID() : meta.requestId, slot: meta.slot,
        ...(mockMode === 'checksum' ? { imageSha256: '0'.repeat(64) } : {}), ...(mockMode === 'probabilities' ? { probabilities: { real: 3, spoof: -2 } } : {}),
        ...(mockMode === 'geometry' ? { diagnostics: { ...v.diagnostics, roi: { width: -1, height: 0 } } } : {}),
        ...(mockMode === 'projection' ? { diagnostics: { ...v.diagnostics, pixels: 'unsafe', bbox: { ...v.diagnostics.bbox, landmarks: ['unsafe'] } } } : {}) }));
    });
    mock.listen(0, '127.0.0.1'); await new Promise<void>(r => mock.once('listening', r));
    try {
      process.env.FACE_PAD_URL = 'http://127.0.0.1:' + (mock.address() as any).port;
      for (const mode of ['stale', 'checksum', 'probabilities', 'geometry']) { mockMode = mode; assert.equal((await request(form(), 'fixture-' + mode)).status, 503); }
      mockMode = 'projection'; const projected = await request(form(), 'fixture-projected'); assert.equal(projected.status, 200);
      assert(!JSON.stringify(await projected.json()).includes('unsafe'));
    }
    finally { mock.closeAllConnections(); await new Promise<void>(r => mock.close(() => r())); }
    const hanging = http.createServer((_req, _res) => {});
    hanging.listen(0, '127.0.0.1'); await new Promise<void>(r => hanging.once('listening', r));
    try {
      process.env.FACE_PAD_URL = 'http://127.0.0.1:' + (hanging.address() as any).port;
      const timeout = await request(form(), 'fixture-timeout'); assert.equal(timeout.status, 504);
      assert.equal((await timeout.json()).errors.code, 'PAD_TIMEOUT');
    } finally { hanging.closeAllConnections(); await new Promise<void>(r => hanging.close(() => r())); }
    console.log('PAD HTTP PASS: real Node auth with fixture provider, real YuNet/MN3 CPU on licensed fixture, binding/projection, default off, limits, concurrency, internal auth, dead service and stale reply');
  } finally { await fixture.close(); }
}
void run().catch(e => { console.error(e); process.exitCode = 1; });
