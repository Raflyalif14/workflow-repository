import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { proofMessage } from '../utils/face-login-crypto';

async function run() {
  process.env.NODE_ENV = 'development'; process.env.FACE_LOGIN_ENABLED = 'true';
  process.env.FACE_LOGIN_SINGLE_GLANCE_ENABLED = 'false';
  process.env.FACE_LOGIN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  const config = require('../config/supabase'), inference = require('../utils/run-face-login-inference');
  const runner = require('../utils/run-face-pad-analysis'), service = require('./face-login.service');
  const owner = crypto.randomUUID(), origin = require('../config/env').ENV.APP_BASE_URL;
  const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const publicKey = pair.publicKey.export({ format: 'jwk' });
  const records: string[] = [];
  let issued = 0, jobs = 0, signedOut = 0;
  let adjust: (result: any) => void = () => {}, afterJob: () => Promise<void> = async () => {}, afterVerify: () => Promise<void> = async () => {};
  const activeProfile = { id: owner, email: 'synthetic@fixture.invalid', full_name: 'Fixture', role: 'SA', is_active: true, must_change_password: false };
  config.supabaseAdmin.from = () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: activeProfile }) });
  config.supabaseAdmin.auth.admin.getUserById = async () => ({ data: { user: { id: owner, email: activeProfile.email } } });
  config.supabaseAdmin.auth.admin.generateLink = async () => ({ data: { properties: { hashed_token: 'synthetic-only' }, user: { id: owner } } });
  config.createSupabaseAuthClient = () => ({ auth: {
    signInWithPassword: async () => ({ data: { session: {}, user: { id: owner } } }),
    signOut: async () => { signedOut++; },
    verifyOtp: async () => { issued++; await afterVerify(); return { data: { user: { id: owner }, session: { access_token: 'fixture-access', refresh_token: 'fixture-refresh' } } }; },
  } });
  inference.runFaceLoginInference = async () => ({ embedding: Array.from({ length: 128 }, (_, i) => i === 0 ? 1 : 0) });
  runner.runFaceLoginJob = async (payload: Buffer) => {
    jobs++;
    const size = payload.readUInt32BE(0), header = JSON.parse(payload.subarray(4, 4 + size).toString());
    assert.equal(header.mode, 'passive-test'); assert.equal(header.template.length, 128);
    let offset = 4 + size;
    const hashes = header.lengths.map((length: number) => { const hash = crypto.createHash('sha256').update(payload.subarray(offset, offset + length)).digest('hex'); offset += length; return hash; });
    const result = { status: 'EVALUATED', version: 'webcam-passive-evaluation-v1', hashes,
      frames: Array.from({ length: 3 }, () => ({ classes: [[.01, .98, .01], [.01, .98, .01]], identity: .8, consistency: .9, yaw: .05 })) };
    adjust(result); await afterJob(); return result;
  };
  const finish = async (challenge: any, options: { owner?: string; test?: boolean; signedAction?: string; signal?: AbortSignal; duplicate?: boolean } = {}) => {
    const frames = [0, 1, 2].map(i => Buffer.from('synthetic-frame-' + (options.duplicate ? 0 : i)));
    const hashes = frames.map(f => crypto.createHash('sha256').update(f).digest('hex'));
    const signature = crypto.sign('sha256', Buffer.from(proofMessage(challenge.id, challenge.nonce, options.signedAction || challenge.action, challenge.deviceId, hashes)), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    return service.finishFaceChallenge({ challengeId: challenge.id, hashes, signature }, frames, origin, options.signal || new AbortController().signal, options.owner, options.test);
  };
  const register = async () => {
    const deviceId = crypto.randomUUID(); records.push(path.resolve(__dirname, '../../../.private/face-login', deviceId + '.json'));
    const challenge = await service.startFaceChallenge({ deviceId, publicKey, password: 'fixture-only' }, origin, owner);
    assert.equal(challenge.action, 'enroll'); await finish(challenge, { owner }); return deviceId;
  };
  const start = async () => service.startFaceChallenge({ deviceId: await register() }, origin);
  const reject = async (change: (result: any) => void, code: RegExp) => {
    const before = issued; adjust = change; const challenge = await start();
    await assert.rejects(finish(challenge), code); assert.equal(issued, before); adjust = () => {};
  };
  try {
    assert.equal(service.faceSingleGlanceEnabled(), false);
    const fallback = await start(); assert.equal(fallback.action, 'login');
    process.env.FACE_LOGIN_SINGLE_GLANCE_ENABLED = 'true';
    assert.equal(service.faceSingleGlanceEnabled(), true);
    await assert.rejects(finish(fallback), /FACE_CHALLENGE_EXPIRED/);
    const challenge = await start(); assert.equal(challenge.action, 'login-passive');
    const result = await finish(challenge); assert.equal(result.accessToken, 'fixture-access'); assert.equal(jobs, 1);
    for (const privateField of ['frames', 'embedding', 'checks', 'accepted', 'evaluationOnly']) assert(!(privateField in result));
    await assert.rejects(finish(challenge), /FACE_CHALLENGE_EXPIRED/); assert.equal(issued, 1);
    await reject(r => { r.frames[2].classes[1] = [.1, .4, .5]; }, /FACE_LIVENESS_FAILED/);
    await reject(r => { r.frames[0].identity = .59; }, /FACE_NO_MATCH/);
    await reject(r => { r.frames[1].consistency = .59; }, /FACE_NO_MATCH/);
    await reject(r => { r.frames[1].yaw = .23; }, /FACE_POSITION_REQUIRED/);
    await reject(r => { r.frames[0].classes[0] = [0, 1, 1]; }, /FACE_PROCESS_FAILED/);
    const beforeProof = jobs;
    await assert.rejects(finish(await start(), { signedAction: 'passive-test' }), /FACE_DEVICE_INVALID/);
    await assert.rejects(finish(await start(), { duplicate: true }), /FACE_IMAGE_INVALID/);
    await assert.rejects(finish(await start(), { owner, test: true }), /FACE_CHALLENGE_EXPIRED/);
    const test = await service.startFacePassiveTest({ deviceId: await register(), sample: 'live' }, origin, owner);
    await assert.rejects(finish(test), /FACE_CHALLENGE_EXPIRED/); assert.equal(jobs, beforeProof);
    const disabled = await start(); process.env.FACE_LOGIN_SINGLE_GLANCE_ENABLED = 'false';
    await assert.rejects(finish(disabled), /FACE_CHALLENGE_EXPIRED/);
    process.env.FACE_LOGIN_SINGLE_GLANCE_ENABLED = 'true';
    afterJob = async () => { process.env.FACE_LOGIN_SINGLE_GLANCE_ENABLED = 'false'; };
    await assert.rejects(finish(await start()), /FACE_DISABLED/); assert.equal(issued, 1);
    process.env.FACE_LOGIN_SINGLE_GLANCE_ENABLED = 'true'; afterJob = async () => {};
    const revoked = await start();
    afterJob = () => service.removeFaceDevice(owner, revoked.deviceId, 'fixture-only');
    await assert.rejects(finish(revoked), /FACE_DEVICE_MISSING/); assert.equal(issued, 1); afterJob = async () => {};
    // Revocation during provider issuance must revoke the fresh session, not return it.
    const duringAuth = await start(); afterVerify = () => service.removeFaceDevice(owner, duringAuth.deviceId, 'fixture-only');
    const beforeSignOut = signedOut;
    await assert.rejects(finish(duringAuth), /FACE_DEVICE_MISSING/);
    assert.equal(issued, 2); assert.equal(signedOut, beforeSignOut + 2); afterVerify = async () => {};
    const abort = new AbortController(), cancelled = await start(); afterJob = async () => abort.abort();
    await assert.rejects(finish(cancelled, { signal: abort.signal }), /FACE_CHALLENGE_EXPIRED/); assert.equal(issued, 2);
    afterJob = async () => {};
    const limitedDevice = await register();
    const startLimited = () => service.startFaceChallenge({ deviceId: limitedDevice }, origin);
    // Successful scans and abandoned starts must not consume the failure allowance.
    for (let i = 0; i < 8; i++) { await startLimited(); await finish(await startLimited()); }
    const rejectIdentity = async (count: number) => {
      adjust = r => { r.frames[0].identity = .2; };
      for (let i = 0; i < count; i++) await assert.rejects(finish(await startLimited()), /FACE_NO_MATCH/);
      adjust = () => {};
    };
    await rejectIdentity(4);
    // Provider/model failures and invalid proofs cannot lock out a legitimate device.
    for (let i = 0; i < 5; i++) {
      adjust = r => { r.frames[0].classes[0] = [0, 1, 1]; };
      await assert.rejects(finish(await startLimited()), /FACE_PROCESS_FAILED/);
      adjust = () => {};
      await assert.rejects(finish(await startLimited(), { signedAction: 'passive-test' }), /FACE_DEVICE_INVALID/);
    }
    await finish(await startLimited()); // Resets the four actual face failures.
    await rejectIdentity(4);
    await finish(await startLimited());
    await rejectIdentity(5);
    await assert.rejects(startLimited(), /FACE_RATE_LIMIT/);
    await finish(await start()); // A different registered device remains usable.
    const realNow = Date.now, expiryBase = realNow();
    try {
      Date.now = () => expiryBase + 10 * 60_000 + 1;
      await finish(await startLimited());
    } finally { Date.now = realNow; }
    process.env.NODE_ENV = 'production'; assert.equal(service.faceSingleGlanceEnabled(), false);
    await assert.rejects(service.startFaceChallenge({ deviceId: challenge.deviceId }, origin), /FACE_DISABLED/);
    console.log('One-glance auth PASS: real signatures and parser policy, every check fail-closed, test/login isolation, no diagnostic output, duplicates/replay, flag changes, abort, revocation including provider race, production-off. Python/provider mocked.');
  } finally { for (const record of records) await fs.rm(record, { force: true }); }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
