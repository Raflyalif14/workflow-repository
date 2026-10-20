import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const { startPadFixture } = require('../../tests/face-pad-fixture.cjs');

async function run() {
  const previousEnv = process.env.NODE_ENV;
  const fixture = await startPadFixture();
  const runner = require('../utils/run-face-pad-analysis');
  const original = runner.runFacePadAnalysis;
  let calls = 0, mode = 'ok';
  runner.runFacePadAnalysis = async (photo: Buffer, signal: AbortSignal) => {
    calls++; assert(!signal.aborted);
    return { schemaVersion: 'pad-capture-analysis-v1', status: 'SUCCESS', prediction: null,
      imageSha256: mode === 'wrong-photo' ? 'a'.repeat(64) : crypto.createHash('sha256').update(photo).digest('hex'),
      modelSha256: 'c4c99af04603b62d7e44f6f4daeb33e0daeccc696008c0b1d62f6f5cebbb3262',
      frame: { width: 640, height: 480 }, decoderMaxDifference: 0, preprocessingMaxDifference: 0,
      brightnessMean: 100, contrastStd: 30, laplacianVariance: 60, privatePixels: 'must-not-escape',
      cropResults: ['CURRENT', 'REFERENCE_RECT', 'FACE_BOX'].map(id => ({ id,
        rect: { left: 100, top: 80, right: 300, bottom: 280 }, opencv: { real: .001, spoof: .999 },
        onnx: { real: .001, spoof: .999 }, maxDifference: 0, runtimeMatches: true, deterministic: true })) };
  };
  const request = (token?: string, bad = false) => {
    const body = new FormData(); body.append('photo', new Blob(['synthetic-image'], { type: 'image/png' }), 'fixture.png');
    body.append('requestId', bad ? 'bad-id' : crypto.randomUUID()); body.append('slot', 'A');
    return fetch(fixture.origin + '/api/face-pad/diagnose', { method: 'POST', body,
      headers: token ? { Authorization: 'Bearer ' + token } : {} });
  };
  try {
    process.env.NODE_ENV = 'development';
    assert.equal((await request()).status, 401);
    assert.equal((await request('invalid')).status, 401);
    assert.equal((await request('password-required')).status, 403);
    process.env.NODE_ENV = 'production';
    assert.equal((await request('fixture-prod')).status, 404);
    process.env.NODE_ENV = 'development'; process.env.FACE_PAD_ENABLED = 'false';
    assert.equal((await request('fixture-disabled')).status, 404);
    process.env.FACE_PAD_ENABLED = 'true';
    assert.equal((await request('fixture-invalid', true)).status, 400);
    assert.equal(calls, 0, 'Denied requests never pass pixels to the analysis subprocess');
    const response = await request('fixture-analysis'); assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const envelope = await response.json(); assert.equal(envelope.data.prediction, null);
    assert.equal(envelope.data.slot, 'A'); assert(!JSON.stringify(envelope).includes('must-not-escape'));
    mode = 'wrong-photo'; assert.equal((await request('fixture-binding')).status, 503);
    console.log('Capture analysis HTTP PASS: actual auth with fixture account provider, dev/opt-in gates, validation, no-store, projection and photo binding; analysis inference stubbed');
  } finally {
    runner.runFacePadAnalysis = original;
    if (previousEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnv;
    await fixture.close();
  }
}
void run().catch(e => { console.error(e); process.exitCode = 1; });
