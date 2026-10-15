import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { checkDeviceProof, openCredential, proofMessage, readDeviceKey, sealCredential } from '../utils/face-login-crypto';

async function run() {
  process.env.NODE_ENV = 'development'; process.env.FACE_LOGIN_ENABLED = 'true';
  process.env.FACE_LOGIN_SINGLE_GLANCE_ENABLED = 'false';
  process.env.FACE_LOGIN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  const config = require('../config/supabase'), inference = require('../utils/run-face-login-inference');
  const owner = crypto.randomUUID(), otherOwner = crypto.randomUUID(), deviceId = crypto.randomUUID();
  const origin = require('../config/env').ENV.APP_BASE_URL;
  const pair = await crypto.webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  assert.equal(pair.privateKey.extractable, false);
  const publicKey = readDeviceKey(await crypto.webcrypto.subtle.exportKey('jwk', pair.publicKey));
  const another = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const recordPath = path.resolve(__dirname, '../../../.private/face-login', deviceId+'.json');
  let authCount = 0, inferCount = 0, live = true, inactive = false;
  const activeProfile = { id: owner, email: 'synthetic@fixture.invalid', full_name: 'Fixture', role: 'SA', is_active: true, must_change_password: false };
  const old = { from: config.supabaseAdmin.from, getUser: config.supabaseAdmin.auth.admin.getUserById, generate: config.supabaseAdmin.auth.admin.generateLink, client: config.createSupabaseAuthClient, inference: inference.runFaceLoginInference, passive: inference.runFacePassiveInference };
  let passiveAccepted = true, passiveCount = 0;
  inference.runFacePassiveInference = async (pictures: Buffer[], template: number[], signal: AbortSignal) => {
    passiveCount++; assert.equal(pictures.length,3); assert.equal(template.length,128); assert.equal(signal.aborted,false);
    return { version:'webcam-passive-evaluation-v1', accepted:passiveAccepted, checks:{pad:passiveAccepted,identity:true,position:true},frames:[] };
  };
  config.supabaseAdmin.auth.admin.getUserById = async () => ({ data: { user: { id: owner, email: activeProfile.email } } });
  config.supabaseAdmin.from = () => ({ select() { return this; }, eq(_field: string, id: string) { return { single: async () => ({ data: { ...activeProfile, id, is_active: !inactive }, error: null }) }; } });
  config.createSupabaseAuthClient = () => ({ auth: {
    signInWithPassword: async ({ password }: any) => password === 'fixture-only' ? { data: { session: {}, user: { id: owner } } } : { data: {}, error: {} },
    signOut: async () => ({}), verifyOtp: async () => { authCount++; return { data: { user: { id: owner }, session: { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' } } }; },
  } });
  config.supabaseAdmin.auth.admin.generateLink = async () => ({ data: { properties: { hashed_token: 'synthetic-one-use' }, user: { id: owner } } });
  inference.runFaceLoginInference = async (frames: Buffer[], direction: string, template?: number[]) => {
    inferCount++; assert.equal(frames.length, 3); assert(['left','right'].includes(direction));
    if (!live) throw Error('FACE_LIVENESS_FAILED');
    if (template) assert.equal(template.length, 128);
    return { embedding: Array.from({ length: 128 }, (_, i) => i === 0 ? 1 : 0) };
  };
  const service = require('./face-login.service');
  const frames = () => [Buffer.from('frame-center'), Buffer.from('frame-turn'), Buffer.from('frame-back')];
  const finish = async (c: any, userId?: string, tamper?: (proof: any) => void, passive = false) => {
    const pictures = frames(), hashes = pictures.map(f => crypto.createHash('sha256').update(f).digest('hex'));
    const message = proofMessage(c.id, c.nonce, c.action, c.deviceId, hashes);
    const bytes = await crypto.webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, Buffer.from(message));
    const signature = Buffer.from(bytes).toString('base64url');
    assert(checkDeviceProof(publicKey, message, signature));
    assert(!checkDeviceProof(readDeviceKey(another.publicKey.export({ format: 'jwk' })), message, signature));
    const proof = { challengeId: c.id, signature, hashes }; tamper?.(proof);
    return service.finishFaceChallenge(proof, pictures, origin, new AbortController().signal, userId, passive);
  };
  try {
    const k = crypto.randomBytes(32), sealed = sealCredential({ privateEmbedding: [1, 0] }, deviceId, k);
    assert(!sealed.includes('privateEmbedding'));
    assert.deepEqual(openCredential(sealed, deviceId, k), { privateEmbedding: [1, 0] });
    assert.throws(() => openCredential(sealed, crypto.randomUUID(), k));
    assert.throws(() => openCredential(sealed, deviceId, crypto.randomBytes(32)));
    assert.throws(() => readDeviceKey({ ...publicKey, d: 'private' }));
    await assert.rejects(service.startFaceChallenge({ deviceId, publicKey, password: 'wrong' }, origin, owner), /FACE_PASSWORD_INVALID/);
    assert.equal(authCount, 0);
    const enrolled = await service.startFaceChallenge({ deviceId, publicKey, password: 'fixture-only' }, origin, owner);
    await assert.rejects(finish(enrolled, otherOwner), /FACE_CHALLENGE_EXPIRED/);
    const enrollment = await service.startFaceChallenge({ deviceId, publicKey, password: 'fixture-only' }, origin, owner);
    assert.deepEqual(await finish(enrollment, owner), { registered: true, deviceId });
    assert.equal(authCount, 0, 'Enrollment never issues a login');
    assert.equal((await service.deviceStatus(owner, deviceId)).registered, true);
    assert.equal((await service.deviceStatus(otherOwner, deviceId)).registered, false);
    const ciphertext = await fs.readFile(recordPath, 'utf8');
    assert(!ciphertext.includes(owner) && !ciphertext.includes('embedding'));
    await assert.rejects(service.startFacePassiveTest({deviceId,sample:'live'},origin,otherOwner),/FACE_DEVICE_MISSING/);
    await assert.rejects(service.startFacePassiveTest({deviceId,sample:['live']},origin,owner),/FACE_ACCESS_DENIED/);
    const test = await service.startFacePassiveTest({deviceId,sample:'live'},origin,owner);
    assert.equal(test.action,'passive-test'); const evaluated = await finish(test,owner,undefined,true);
    assert.equal(evaluated.accepted,true); assert.equal(evaluated.sample,'live'); assert.equal(evaluated.evaluationOnly,true);
    assert(!('accessToken' in evaluated) && !('embedding' in evaluated)); assert.equal(authCount,0);
    await assert.rejects(finish(test,owner,undefined,true),/FACE_CHALLENGE_EXPIRED/);
    const crossed = await service.startFacePassiveTest({deviceId,sample:'photo'},origin,owner);
    await assert.rejects(finish(crossed),/FACE_CHALLENGE_EXPIRED/);
    const wrongOwnerTest = await service.startFacePassiveTest({deviceId,sample:'video'},origin,owner);
    await assert.rejects(finish(wrongOwnerTest,otherOwner,undefined,true),/FACE_CHALLENGE_EXPIRED/);
    const testAsEnroll = await service.startFacePassiveTest({deviceId,sample:'photo'},origin,owner);
    await assert.rejects(finish(testAsEnroll,owner),/FACE_CHALLENGE_EXPIRED/);
    passiveAccepted=false;
    const blockedReplay=await service.startFacePassiveTest({deviceId,sample:'video'},origin,owner);
    assert.equal((await finish(blockedReplay,owner,undefined,true)).accepted,false);
    assert.equal(passiveCount,2); assert.equal(authCount,0); assert.equal(await fs.readFile(recordPath,'utf8'),ciphertext,'Tests cannot replace enrollment');
    const login = await service.startFaceChallenge({ deviceId }, origin);
    const result = await finish(login); assert.equal(result.accessToken, 'synthetic-access'); assert.equal(result.user.id, owner); assert.equal(authCount, 1);
    await assert.rejects(finish(login), /FACE_CHALLENGE_EXPIRED/); assert.equal(authCount, 1);
    const before = inferCount, tampered = await service.startFaceChallenge({ deviceId }, origin);
    await assert.rejects(finish(tampered, undefined, p => { p.hashes.reverse(); }), /FACE_IMAGE_INVALID/);
    assert.equal(inferCount, before, 'Bad proof is rejected before images reach Python');
    // A real login challenge also cannot be completed as a test (consume it once).
    const crossDevice=crypto.randomUUID();
    const enrollAsTest=await service.startFaceChallenge({deviceId:crossDevice,publicKey,password:'fixture-only'},origin,owner);
    await assert.rejects(finish(enrollAsTest,owner,undefined,true),/FACE_CHALLENGE_EXPIRED/);
    assert.equal((await service.deviceStatus(owner,crossDevice)).registered,false);
    await service.startFaceChallenge({ deviceId }, origin);
    await service.removeFaceDevice(owner, deviceId, 'fixture-only');
    assert.equal((await service.deviceStatus(owner, deviceId)).registered, false);
    const rejectedId = crypto.randomUUID();
    const failed = await service.startFaceChallenge({ deviceId: rejectedId, publicKey, password: 'fixture-only' }, origin, owner);
    live = false; await assert.rejects(finish(failed, owner), /FACE_LIVENESS_FAILED/);
    assert.equal((await service.deviceStatus(owner, rejectedId)).registered, false); assert.equal(authCount, 1);
    inactive = true;
    await assert.rejects(service.startFaceChallenge({ deviceId: crypto.randomUUID(), publicKey, password: 'fixture-only' }, origin, owner), /FACE_ACCESS_DENIED/);
    assert.throws(() => service.faceLoginOrigin('https://attacker.invalid'), /FACE_ACCESS_DENIED/);
    process.env.NODE_ENV = 'production'; assert.equal(service.faceLoginEnabled(), false);
    console.log('Camera auth PASS: signatures/encryption, enrollment/login, signed image order, rate/revocation, passive test ownership and purpose separation, no test session or template writes, failed PAD/inactive/default-off. Provider/inference mocked.');
  } finally {
    await fs.rm(recordPath, { force: true });
    config.supabaseAdmin.from = old.from; config.supabaseAdmin.auth.admin.generateLink = old.generate;
    config.supabaseAdmin.auth.admin.getUserById = old.getUser;
    config.createSupabaseAuthClient = old.client; inference.runFaceLoginInference = old.inference;
    inference.runFacePassiveInference = old.passive;
  }
}
void run().catch(e => { console.error(e); process.exitCode = 1; });
