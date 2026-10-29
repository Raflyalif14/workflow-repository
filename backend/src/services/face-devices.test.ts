import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { openCredential, proofMessage, sealCredential } from '../utils/face-login-crypto';
import { faceDeviceInfo } from '../utils/face-device-info';

async function run() {
  process.env.NODE_ENV = 'development'; process.env.FACE_LOGIN_ENABLED = 'true'; process.env.FACE_LOGIN_SINGLE_GLANCE_ENABLED = 'true';
  const encryptionKey = crypto.randomBytes(32); process.env.FACE_LOGIN_ENCRYPTION_KEY = encryptionKey.toString('hex');
  process.env.SUPABASE_URL = 'http://127.0.0.1:1'; process.env.SUPABASE_ANON_KEY = 'synthetic'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic';
  const config = require('../config/supabase'), inference = require('../utils/run-face-login-inference'), service = require('./face-login.service');
  const store = path.resolve(__dirname, '../../../.private/face-login'), origin = require('../config/env').ENV.APP_BASE_URL;
  const owner = crypto.randomUUID(), other = crypto.randomUUID(), ids: string[] = [];
  const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }), publicKey = pair.publicKey.export({ format: 'jwk' });
  const original = { readdir: fs.readdir, rename: fs.rename, now: Date.now };
  // Never enumerate or decrypt user records: this suite sees only its own synthetic UUIDs.
  (fs as any).readdir = async (location: string, ...args: any[]) => path.resolve(String(location)) === store
    ? ids.map(id => id + '.json').concat('not-a-device.json', 'ignored.tmp') : (original.readdir as any)(location, ...args);
  let clock = original.now(), faceError = '', providerError = false, signouts = 0;
  Date.now = () => clock;
  const profile = (id: string) => ({ id, email: id + '@fixture.invalid', full_name: 'Fixture', role: 'SA', is_active: true, must_change_password: false });
  config.supabaseAdmin.from = () => ({ userId: '', select() { return this; }, eq(_key: string, id: string) { this.userId = id; return this; }, single: async function () { return { data: profile(this.userId) }; } });
  config.supabaseAdmin.auth.admin.getUserById = async (id: string) => ({ data: { user: profile(id) } });
  config.supabaseAdmin.auth.admin.generateLink = async ({ email }: { email: string }) => ({ data: { properties: { hashed_token: email }, user: { id: email.split('@')[0] } } });
  config.createSupabaseAuthClient = () => ({ auth: {
    signInWithPassword: async ({ email, password }: any) => password === 'fixture-password'
      ? { data: { user: profile(email.split('@')[0]), session: {} } } : { data: {}, error: {} },
    signOut: async () => { signouts++; },
    verifyOtp: async ({ token_hash }: any) => providerError ? { data: {}, error: {} }
      : { data: { user: profile(token_hash.split('@')[0]), session: { access_token: 'synthetic', refresh_token: 'synthetic' } } },
  } });
  let faceIndex = 0;
  inference.runFaceLoginInference = async () => ({ embedding: Array.from({ length: 128 }, (_, i) => i === faceIndex ? 1 : 0) });
  inference.runFacePassiveLoginInference = async () => { if (faceError) throw Error(faceError); };
  const finish = async (challenge: any, userId?: string) => {
    const frames = [0, 1, 2].map(i => Buffer.from('synthetic-only-' + i));
    const hashes = frames.map(frame => crypto.createHash('sha256').update(frame).digest('hex'));
    const signature = crypto.sign('sha256', Buffer.from(proofMessage(challenge.id, challenge.nonce, challenge.action, challenge.deviceId, hashes)),
      { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    return service.finishFaceChallenge({ challengeId: challenge.id, hashes, signature }, frames, origin, new AbortController().signal, userId);
  };
  const register = async (userId: string, ua?: string, index = userId === owner ? 0 : 1) => {
    faceIndex = index;
    const deviceId = crypto.randomUUID(); ids.push(deviceId); clock += 1000;
    await finish(await service.startFaceChallenge({ deviceId, publicKey, password: 'fixture-password' }, origin, userId, ua), userId); return deviceId;
  };
  const login = async (deviceId: string, ua?: string) => { clock += 1000; return finish(await service.startFaceChallenge({ deviceId }, origin, undefined, ua)); };
  const list = async (userId = owner) => (await service.listFaceDevices(userId)).devices;
  const location = (id: string) => path.join(store, id + '.json');
  try {
    for (const [ua, browser, platform] of [
      ['Windows Chrome/130 Safari/537 Edg/130', 'edge', 'windows'], ['Windows Chrome/130 Safari/537', 'chrome', 'windows'],
      ['Linux Android Chrome/130 SamsungBrowser/27', 'samsung', 'android'], ['Linux Chrome/130 OPR/110', 'opera', 'linux'],
      ['iPhone Mac OS X CriOS/130 Safari/604', 'chrome', 'ios'], ['iPad Mac OS X FxiOS/130 Safari/604', 'firefox', 'ios'],
      ['Macintosh Version/18 Safari/605', 'safari', 'macos'], ['arbitrary text', 'unknown', 'unknown'],
    ]) assert.deepEqual(faceDeviceInfo(ua), { browser, platform });
    const edge = await register(owner, 'Windows Chrome/130 Safari/537 Edg/130');
    const chrome = await register(owner, 'Linux Android Chrome/130');
    await assert.rejects(register(other, 'Macintosh Safari/605', 0), /FACE_ALREADY_REGISTERED/, 'A face already owned by another account cannot be reused');
    const outsider = await register(other, 'Macintosh Safari/605');
    let devices = await list();
    assert.deepEqual(devices.map((item: any) => item.deviceId), [chrome, edge]);
    assert(devices.every((item: any) => item.lastUsedAt === null));
    assert.deepEqual(Object.keys(devices[0]).sort(), ['browser', 'createdAt', 'deviceId', 'lastUsedAt', 'platform']);
    assert.equal(devices[1].browser, 'edge'); assert.equal((await list(other))[0].deviceId, outsider);
    const registeredAt = devices[1].createdAt;
    await login(edge, 'Windows Chrome/130 Safari/537 Edg/130');
    const lastUsed = (await list()).find((item: any) => item.deviceId === edge).lastUsedAt;
    assert.equal(lastUsed, new Date(clock).toISOString());
    faceError = 'FACE_NO_MATCH'; await assert.rejects(login(edge), /FACE_NO_MATCH/); faceError = '';
    providerError = true; await assert.rejects(login(edge), /FACE_AUTH_UNAVAILABLE/); providerError = false;
    assert.equal((await list()).find((item: any) => item.deviceId === edge).lastUsedAt, lastUsed);
    // An old-format synthetic registration upgrades only after successful sign-in.
    const oldRecord = openCredential(await fs.readFile(location(edge), 'utf8'), edge, encryptionKey);
    delete oldRecord.deviceInfo; delete oldRecord.lastUsedAt;
    await fs.writeFile(location(edge), sealCredential(oldRecord, edge, encryptionKey)); oldRecord.embedding.fill(0);
    devices = await list(); assert.equal(devices[1].browser, 'unknown'); assert.equal(devices[1].lastUsedAt, null);
    await login(edge, 'Windows Chrome/131 Safari/537 Edg/131');
    devices = await list(); assert.equal(devices[1].browser, 'edge'); assert.equal(devices[1].createdAt, registeredAt); assert(devices[1].lastUsedAt);
    const persisted = await fs.readFile(location(edge), 'utf8');
    assert(!persisted.includes('Windows')); assert(!persisted.includes('embedding')); assert(!persisted.includes(owner));
    await assert.rejects(service.removeFaceDevice(owner, outsider, 'fixture-password'), /FACE_DEVICE_MISSING/);
    await assert.rejects(service.removeFaceDevice(owner, chrome, 'wrong-password'), /FACE_PASSWORD_INVALID/);
    const pending = await service.startFaceChallenge({ deviceId: chrome }, origin);
    await service.removeFaceDevice(owner, chrome, 'fixture-password');
    assert.deepEqual((await list()).map((item: any) => item.deviceId), [edge]);
    await assert.rejects(finish(pending), /FACE_CHALLENGE_EXPIRED/); await login(edge);
    // Pause the atomic timestamp replacement, then revoke while that write holds its lock.
    let reached!: () => void, release!: () => void;
    const entered = new Promise<void>(resolve => { reached = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    (fs as any).rename = async (source: string, target: string) => {
      if (String(target) === location(edge)) { reached(); await gate; }
      return original.rename(source, target);
    };
    const inFlight = login(edge).then(() => 'issued', error => error.message);
    try {
      await entered;
      const removal = service.removeFaceDevice(owner, edge, 'fixture-password');
      await new Promise(resolve => setImmediate(resolve)); release();
      await removal;
      assert(['issued', 'FACE_DEVICE_MISSING'].includes(await inFlight));
    } finally { release(); (fs as any).rename = original.rename; }
    await assert.rejects(fs.stat(location(edge)), { code: 'ENOENT' }); assert.equal((await list()).length, 0);
    const remaining = await register(owner); await service.removeAllFaceDevices(owner, 'fixture-password');
    await assert.rejects(fs.stat(location(remaining)), { code: 'ENOENT' }); assert.equal((await list(other))[0].deviceId, outsider);
    assert(signouts > 0);
    console.log('Face device management PASS: owner-only safe metadata, browser parsing, old-record compatibility, successful-login timestamps, encrypted storage, password confirmation, single/all revocation, pending challenge cancellation and concurrent update/revoke without resurrection. Provider and face inference mocked.');
  } finally {
    (fs as any).readdir = original.readdir; (fs as any).rename = original.rename; Date.now = original.now; encryptionKey.fill(0);
    for (const id of ids) await fs.rm(location(id), { force: true });
  }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
