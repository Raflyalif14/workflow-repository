import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const { startPadFixture } = require('../../tests/face-pad-fixture.cjs');

async function run() {
  const previousEnv = process.env.NODE_ENV, fixture = await startPadFixture();
  const runner = require('../utils/run-face-pad-analysis'), original = runner.runFacePadCandidate;
  let calls = 0, mode = 'ok';
  runner.runFacePadCandidate = async (photo: Buffer, signal: AbortSignal) => {
    calls++; assert(!signal.aborted);
    return { status: 'SUCCESS', prediction: null, durationMs: 120,
      imageSha256: mode === 'wrong-photo' ? 'a'.repeat(64) : crypto.createHash('sha256').update(photo).digest('hex'),
      frame: { width: 640, height: 480 }, baseline: { real: .001, spoof: .999 }, privatePixels: 'must-not-escape',
      candidate: { version: 'minifas-yunet-native-v1', probabilities: { real: .5, spoof: .5 }, models: [
        { model: 'MiniFASNetV2', sha256: 'a5eb02e1843f19b5386b953cc4c9f011c3f985d0ee2bb9819eea9a142099bec0',
          onnxSha256: '2e4d897d506d2265ae3bf8c092002a527b2e78d940f8c60223a4ee03b7b65e11', scale: 2.7,
          rect: { left: 0, top: 0, right: 640, bottom: 480 }, classes: [.2, .7, .1] },
        { model: 'MiniFASNetV1SE', sha256: '84ee1d37d96894d5e82de5a57df044ef80a58be2b218b5ed7cdfd875ec2f5990',
          onnxSha256: '6e4baab0c157a97f274f69bbd2bc3cf773c2ccd635a613930963963669dc3af5', scale: 4,
          rect: { left: 0, top: 0, right: 640, bottom: 480 }, classes: [.1, .3, .6] },
      ] } };
  };
  const request = (token?: string, bad = false) => {
    const body = new FormData(); body.append('photo', new Blob(['synthetic-image'], { type: 'image/png' }), 'fixture.png');
    body.append('requestId', bad ? 'bad-id' : crypto.randomUUID()); body.append('slot', 'A');
    return fetch(fixture.origin + '/api/face-pad/candidate', { method: 'POST', body,
      headers: token ? { Authorization: 'Bearer ' + token } : {} });
  };
  const capability = async () => (await (await fetch(fixture.origin + '/api/face-pad/capabilities',
    { headers: { Authorization: 'Bearer fixture-capability' } })).json()).data.candidateEnabled;
  try {
    process.env.NODE_ENV = 'development';
    assert.equal(await capability(), true);
    assert.equal((await request()).status, 401);
    assert.equal((await request('invalid')).status, 401);
    assert.equal((await request('password-required')).status, 403);
    assert.equal((await request('inactive')).status, 401);
    process.env.NODE_ENV = 'production'; assert.equal(await capability(), false);
    assert.equal((await request('fixture-prod')).status, 404);
    process.env.NODE_ENV = 'development'; process.env.FACE_PAD_ENABLED = 'false';
    assert.equal(await capability(), false); assert.equal((await request('fixture-disabled')).status, 404);
    process.env.FACE_PAD_ENABLED = 'true';
    assert.equal((await request('fixture-invalid', true)).status, 400);
    assert.equal(calls, 0, 'Denied requests never reach candidate inference');
    const response = await request('fixture-candidate'); assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const envelope = await response.json(); assert.equal(envelope.data.prediction, null);
    assert.equal(envelope.data.slot, 'A'); assert(!JSON.stringify(envelope).includes('must-not-escape'));
    mode = 'wrong-photo'; assert.equal((await request('fixture-binding')).status, 503);
    console.log('Candidate HTTP PASS: real auth with fixture provider, active-account/dev/opt-in gates, capability, validation, no-store, projection and SHA binding. Inference stubbed.');
  } finally {
    runner.runFacePadCandidate = original;
    if (previousEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnv;
    await fixture.close();
  }
}
void run().catch(e => { console.error(e); process.exitCode = 1; });
