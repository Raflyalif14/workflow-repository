import crypto from 'node:crypto';
import { matchesRegisteredFace } from '../utils/face-account-match';
import { promises as fs } from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createSupabaseAuthClient, supabaseAdmin } from '../config/supabase';
import { ENV } from '../config/env';
import { buildLoginResult } from './auth.service';
import { checkDeviceProof, deviceIdValid, FACE_LOGIN_VERSION, openCredential, proofMessage, readDeviceKey, sealCredential, DevicePublicKey } from '../utils/face-login-crypto';
import { runFaceLoginInference, runFacePassiveInference, runFacePassiveLoginInference } from '../utils/run-face-login-inference';
import { faceDeviceInfo, validFaceDeviceInfo, FaceDeviceInfo } from '../utils/face-device-info';

type Credential = { deviceId: string; userId: string; publicKey: DevicePublicKey; embedding: number[]; version: string; createdAt: string; deviceInfo?: FaceDeviceInfo; lastUsedAt?: string };
type Challenge = { id: string; nonce: string; deviceId: string; action: 'enroll' | 'login' | 'login-passive' | 'passive-test'; expires: number; direction: 'left' | 'right';
  origin: string; userId?: string; publicKey?: DevicePublicKey; credentialVersion?: string; deviceInfo?: FaceDeviceInfo; sample?: 'live' | 'photo' | 'video' };
const pending = new Map<string, Challenge>(), attempts = new Map<string, { count: number; until: number }>();
const credentialLocks = new Map<string, Promise<void>>();
const ROOT = path.resolve(__dirname, '../../..'), STORE = path.join(ROOT, '.private/face-login');
const key = () => {
  const value = process.env.FACE_LOGIN_ENCRYPTION_KEY;
  if (value && /^[a-f0-9]{64}$/.test(value)) return Buffer.from(value, 'hex');
  if (value) throw Error('FACE_STORE_UNAVAILABLE');
  try { const bytes = readFileSync(path.join(ROOT, '.private/face-login-key.bin')); if (bytes.length === 32) return bytes; bytes.fill(0); } catch { /* unavailable */ }
  throw Error('FACE_STORE_UNAVAILABLE');
};
export function faceLoginEnabled() {
  if (process.env.NODE_ENV !== 'development' || process.env.FACE_LOGIN_ENABLED !== 'true') return false;
  try { const k = key(); k.fill(0); return true; } catch { return false; }
}
export function faceSingleGlanceEnabled() {
  return faceLoginEnabled() && process.env.FACE_LOGIN_SINGLE_GLANCE_ENABLED === 'true';
}
export function faceLoginOrigin(origin: unknown) {
  if (typeof origin !== 'string' || origin !== ENV.APP_BASE_URL.replace(/\/$/, '')) throw Error('FACE_ACCESS_DENIED');
  return origin;
}
function clean() {
  const now = Date.now(); for (const [id, c] of pending) if (c.expires <= now) pending.delete(id);
  for (const [id, a] of attempts) if (a.until <= now) attempts.delete(id);
}
function rateDevice(deviceId: string, limit = 5) {
  clean(); const state = attempts.get(deviceId) || { count: 0, until: Date.now() + 10 * 60_000 };
  if (++state.count > limit) throw Error('FACE_RATE_LIMIT');
  if (attempts.size >= 2000 && !attempts.has(deviceId)) throw Error('FACE_BUSY'); attempts.set(deviceId, state);
}
function checkLoginFailures(deviceId: string) {
  clean();
  const name = 'login:' + deviceId;
  if ((attempts.get(name)?.count || 0) >= 5) throw Error('FACE_RATE_LIMIT');
  if (attempts.size >= 2000 && !attempts.has(name)) throw Error('FACE_BUSY');
}
function recordLoginFailure(deviceId: string) {
  clean();
  const name = 'login:' + deviceId;
  attempts.set(name, { count: (attempts.get(name)?.count || 0) + 1, until: Date.now() + 10 * 60_000 });
}
const faceRejections = new Set(['FACE_NONE', 'FACE_MULTIPLE', 'FACE_POSITION_REQUIRED', 'FACE_LIVENESS_FAILED', 'FACE_MOTION_REQUIRED', 'FACE_NO_MATCH']);
async function withCredentialLock<T>(deviceId: string, work: () => Promise<T>): Promise<T> {
  const previous = credentialLocks.get(deviceId);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  credentialLocks.set(deviceId, gate);
  await previous;
  try { return await work(); }
  finally { release(); if (credentialLocks.get(deviceId) === gate) credentialLocks.delete(deviceId); }
}
async function readCredential(deviceId: string): Promise<Credential | null> {
  if (!deviceIdValid(deviceId)) throw Error('FACE_DEVICE_INVALID');
  try {
    const location = path.join(STORE, deviceId + '.json'), stat = await fs.lstat(location);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384) throw Error('FACE_STORE_UNAVAILABLE');
    const k = key(); let value: Credential;
    try { value = openCredential(await fs.readFile(location, 'utf8'), deviceId, k); } finally { k.fill(0); }
    if (value.deviceId !== deviceId || !deviceIdValid(value.userId) || value.version !== FACE_LOGIN_VERSION
      || !Array.isArray(value.embedding) || value.embedding.length !== 128 || !value.embedding.every(Number.isFinite)
      || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
      || value.lastUsedAt !== undefined && (typeof value.lastUsedAt !== 'string' || !Number.isFinite(Date.parse(value.lastUsedAt)))
      || value.deviceInfo !== undefined && !validFaceDeviceInfo(value.deviceInfo)) throw Error('FACE_STORE_UNAVAILABLE');
    value.publicKey = readDeviceKey(value.publicKey); return value;
  } catch (error: any) { if (error.code === 'ENOENT') return null; throw Error('FACE_STORE_UNAVAILABLE'); }
}
async function saveCredential(credential: Credential) {
  await withCredentialLock(credential.deviceId, async () => {
    await fs.mkdir(STORE, { recursive: true, mode: 0o700 });
    const k = key();
    try { await fs.writeFile(path.join(STORE, credential.deviceId + '.json'), sealCredential(credential, credential.deviceId, k), { flag: 'wx', mode: 0o600 }); }
    finally { k.fill(0); }
  });
}
async function recordSuccessfulLogin(c: Challenge) {
  await withCredentialLock(c.deviceId, async () => {
    const current = await readCredential(c.deviceId);
    try {
      if (!current || current.userId !== c.userId || current.createdAt !== c.credentialVersion) throw Error('FACE_DEVICE_MISSING');
      current.lastUsedAt = new Date(Math.max(Date.now(), Date.parse(current.lastUsedAt || current.createdAt))).toISOString();
      current.deviceInfo = {
        browser: c.deviceInfo?.browser !== 'unknown' && c.deviceInfo?.browser || current.deviceInfo?.browser || 'unknown',
        platform: c.deviceInfo?.platform !== 'unknown' && c.deviceInfo?.platform || current.deviceInfo?.platform || 'unknown',
      };
      const temporary = path.join(STORE, c.deviceId + '.' + crypto.randomUUID() + '.tmp'), k = key();
      try {
        await fs.writeFile(temporary, sealCredential(current, c.deviceId, k), { flag: 'wx', mode: 0o600 });
        await fs.rename(temporary, path.join(STORE, c.deviceId + '.json'));
      } catch { throw Error('FACE_STORE_UNAVAILABLE'); }
      finally { k.fill(0); await fs.unlink(temporary).catch(() => {}); }
    } finally { current?.embedding.fill(0); }
  });
}
async function credentialIds(): Promise<string[]> {
  try { return (await fs.readdir(STORE)).filter(name => name.endsWith('.json') && deviceIdValid(name.slice(0, -5))).map(name => name.slice(0, -5)); }
  catch (error: any) { if (error.code === 'ENOENT') return []; throw Error('FACE_STORE_UNAVAILABLE'); }
}
export async function listFaceDevices(userId: string) {
  await profile(userId);
  const devices: { deviceId: string; browser: FaceDeviceInfo['browser']; platform: FaceDeviceInfo['platform']; createdAt: string; lastUsedAt: string | null }[] = [];
  for (const deviceId of await credentialIds()) {
    const credential = await readCredential(deviceId);
    try {
      if (credential?.userId === userId) devices.push({ deviceId, browser: credential.deviceInfo?.browser || 'unknown', platform: credential.deviceInfo?.platform || 'unknown',
        createdAt: credential.createdAt, lastUsedAt: credential.lastUsedAt || null });
    } finally { credential?.embedding.fill(0); }
  }
  devices.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.deviceId.localeCompare(b.deviceId));
  return { devices };
}
async function profile(userId: string) {
  const { data, error } = await supabaseAdmin.from('users').select('id,email,full_name,role,is_active,must_change_password,created_at,updated_at,preferred_language').eq('id', userId).single();
  if (error || !data?.is_active || data.must_change_password) throw Error('FACE_ACCESS_DENIED'); return data;
}
export async function confirmFacePassword(userId: string, password: unknown) {
  if (typeof password !== 'string' || password.length < 1 || password.length > 512) throw Error('FACE_PASSWORD_INVALID');
  const user = await profile(userId), client = createSupabaseAuthClient();
  const { data, error } = await client.auth.signInWithPassword({ email: user.email, password });
  if (error || !data.session || data.user?.id !== userId) throw Error('FACE_PASSWORD_INVALID');
  // Reauthentication is only evidence for this operation, never a second stored session.
  await client.auth.signOut({ scope: 'local' });
  return user;
}
export async function deviceStatus(userId: string, deviceId: string) {
  const credential = await readCredential(deviceId);
  try { return { registered: credential?.userId === userId }; } finally { credential?.embedding.fill(0); }
}
function publicChallenge(c: Challenge) { return { id: c.id, nonce: c.nonce, deviceId: c.deviceId, action: c.action, direction: c.direction, expiresAt: new Date(c.expires).toISOString() }; }
export async function startFaceChallenge(input: { deviceId: string; publicKey?: unknown; password?: unknown }, origin: string, userId?: string, userAgent?: string) {
  if (!faceLoginEnabled()) throw Error('FACE_DISABLED');
  faceLoginOrigin(origin); if (!deviceIdValid(input.deviceId)) throw Error('FACE_DEVICE_INVALID');
  if (userId) rateDevice('enroll:' + input.deviceId); else checkLoginFailures(input.deviceId);
  if (pending.size >= 100) throw Error('FACE_BUSY');
  const credential = await readCredential(input.deviceId);
  try {
    const action = userId ? 'enroll' : faceSingleGlanceEnabled() ? 'login-passive' : 'login';
    if (action === 'enroll') {
      if (credential) throw Error('FACE_DEVICE_EXISTS');
      await confirmFacePassword(userId!, input.password);
    } else if (!credential) throw Error('FACE_DEVICE_MISSING');
    if (credential) await profile(credential.userId);
    const c: Challenge = { id: crypto.randomUUID(), nonce: crypto.randomBytes(32).toString('base64url'), deviceId: input.deviceId,
      action, origin, expires: Date.now() + 90_000, direction: crypto.randomInt(2) ? 'left' : 'right',
      userId: userId || credential?.userId, publicKey: userId ? readDeviceKey(input.publicKey) : undefined, credentialVersion: credential?.createdAt, deviceInfo: faceDeviceInfo(userAgent) };
    for (const [id, value] of pending) if (value.deviceId === c.deviceId) pending.delete(id);
    pending.set(c.id, c); return publicChallenge(c);
  } finally { credential?.embedding.fill(0); }
}
export async function startFacePassiveTest(input: { deviceId: string; sample: unknown }, origin: string, userId: string) {
  if (!faceLoginEnabled()) throw Error('FACE_DISABLED');
  faceLoginOrigin(origin);
  if (!userId || typeof input.sample !== 'string' || !['live', 'photo', 'video'].includes(input.sample)) throw Error('FACE_ACCESS_DENIED');
  if (!deviceIdValid(input.deviceId)) throw Error('FACE_DEVICE_INVALID');
  rateDevice('passive:' + input.deviceId, 9); if (pending.size >= 100) throw Error('FACE_BUSY');
  const credential = await readCredential(input.deviceId);
  try {
    if (!credential || credential.userId !== userId) throw Error('FACE_DEVICE_MISSING');
    await profile(userId);
    const c: Challenge = { id: crypto.randomUUID(), nonce: crypto.randomBytes(32).toString('base64url'), deviceId: input.deviceId,
      action: 'passive-test', origin, userId, expires: Date.now()+90_000, direction: 'left', credentialVersion: credential.createdAt,
      sample: input.sample as Challenge['sample'] };
    for (const [id, value] of pending) if (value.deviceId === c.deviceId && value.action === 'passive-test') pending.delete(id);
    pending.set(c.id, c); return { ...publicChallenge(c), sample: c.sample };
  } finally { credential?.embedding.fill(0); }
}
export async function finishFaceChallenge(input: { challengeId: string; signature: string; hashes: string[] }, frames: Buffer[], origin: string, signal: AbortSignal, userId?: string, passiveTest = false) {
  if (!faceLoginEnabled()) throw Error('FACE_DISABLED');
  const c = pending.get(input.challengeId);
  // Every submitted challenge is single-use, including invalid submissions.
  pending.delete(input.challengeId);
  const expectedAction = passiveTest ? 'passive-test' : userId ? 'enroll' : faceSingleGlanceEnabled() ? 'login-passive' : 'login';
  if (!c || c.expires <= Date.now() || c.origin !== faceLoginOrigin(origin) || c.action !== expectedAction
    || passiveTest && !userId || userId && c.userId !== userId) throw Error('FACE_CHALLENGE_EXPIRED');
  const credential = c.action !== 'enroll' ? await readCredential(c.deviceId) : null;
  let result: { embedding: number[] } | undefined;
  let verifiedLogin = false;
  try {
    if (c.action !== 'enroll' && (!credential || credential.userId !== c.userId || credential.createdAt !== c.credentialVersion)) throw Error('FACE_DEVICE_MISSING');
    if (frames.length !== 3 || !Array.isArray(input.hashes) || input.hashes.length !== 3) throw Error('FACE_IMAGE_INVALID');
    const hashes = frames.map(f => crypto.createHash('sha256').update(f).digest('hex'));
    if (hashes.some((h, i) => h !== input.hashes[i]) || new Set(hashes).size !== 3) throw Error('FACE_IMAGE_INVALID');
    if (!checkDeviceProof(credential?.publicKey || c.publicKey!, proofMessage(c.id, c.nonce, c.action, c.deviceId, hashes), input.signature)) throw Error('FACE_DEVICE_INVALID');
    if (c.action === 'login' || c.action === 'login-passive') {
      checkLoginFailures(c.deviceId); verifiedLogin = true;
    }
    await profile(c.userId!);
    if (c.action === 'passive-test') {
      const evaluation = await runFacePassiveInference(frames, credential!.embedding, signal);
      if (signal.aborted || c.expires <= Date.now()) throw Error('FACE_CHALLENGE_EXPIRED');
      await profile(c.userId!);
      const current = await readCredential(c.deviceId);
      try { if (!current || current.createdAt !== c.credentialVersion || current.userId !== userId) throw Error('FACE_DEVICE_MISSING'); }
      finally { current?.embedding.fill(0); }
      return { ...evaluation, sample: c.sample, evaluationOnly: true, testedAt: new Date().toISOString() };
    }
    if (c.action === 'login-passive') await runFacePassiveLoginInference(frames, credential!.embedding, signal);
    else result = await runFaceLoginInference(frames, c.direction, credential?.embedding, signal);
    if (signal.aborted || c.expires <= Date.now()) throw Error('FACE_CHALLENGE_EXPIRED');
    if (c.action === 'enroll') {
      await profile(c.userId!);
      await withCredentialLock('enroll-accounts', async () => {
        for (const id of await credentialIds()) {
          const existing = await readCredential(id);
          try { if (existing && existing.userId !== c.userId && matchesRegisteredFace(existing.embedding, result!.embedding)) throw Error('FACE_ALREADY_REGISTERED'); }
          finally { existing?.embedding.fill(0); }
        }
        if (signal.aborted || c.expires <= Date.now()) throw Error('FACE_CHALLENGE_EXPIRED');
        await profile(c.userId!);
        await saveCredential({ deviceId: c.deviceId, userId: c.userId!, publicKey: c.publicKey!, embedding: result!.embedding, version: FACE_LOGIN_VERSION, createdAt: new Date(Date.now()).toISOString(), deviceInfo: c.deviceInfo });
      });
      return { registered: true, deviceId: c.deviceId };
    }
    const assertCurrent = async () => {
      if (!faceLoginEnabled() || c.action === 'login-passive' && !faceSingleGlanceEnabled()) throw Error('FACE_DISABLED');
      if (signal.aborted || c.expires <= Date.now()) throw Error('FACE_CHALLENGE_EXPIRED');
      const current = await readCredential(c.deviceId);
      try { if (!current || current.createdAt !== c.credentialVersion || current.userId !== c.userId) throw Error('FACE_DEVICE_MISSING'); }
      finally { current?.embedding.fill(0); }
    };
    await assertCurrent();
    const user = await profile(c.userId!);
    // Supabase issues the session only after the signed device proof + camera checks.
    // generateLink does not send email; the one-use token never leaves this backend.
    const { data: account, error: accountError } = await supabaseAdmin.auth.admin.getUserById(c.userId!);
    if (accountError || account?.user?.id !== c.userId || !account.user.email || account.user.email.toLowerCase() !== user.email.toLowerCase()) throw Error('FACE_AUTH_UNAVAILABLE');
    const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email: account.user.email });
    if (linkError || !link?.properties?.hashed_token || link.user?.id !== c.userId) throw Error('FACE_AUTH_UNAVAILABLE');
    await assertCurrent();
    const client = createSupabaseAuthClient();
    const { data, error } = await client.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
    if (error || !data.session || data.user?.id !== c.userId) throw Error('FACE_AUTH_UNAVAILABLE');
    try {
      const current = await profile(c.userId!);
      await assertCurrent();
      const loginResult = buildLoginResult(current, data.session);
      await recordSuccessfulLogin(c);
      await assertCurrent();
      attempts.delete('login:' + c.deviceId);
      return loginResult;
    } catch (error) { await client.auth.signOut({ scope: 'local' }); throw error; }
  } catch (error) {
    if (verifiedLogin && !signal.aborted && error instanceof Error && faceRejections.has(error.message)) recordLoginFailure(c.deviceId);
    throw error;
  } finally { credential?.embedding.fill(0); result?.embedding.fill(0); frames.forEach(f => f.fill(0)); }
}
async function removeOwnedDevice(userId: string, deviceId: string, required: boolean) {
  await withCredentialLock(deviceId, async () => {
    const credential = await readCredential(deviceId);
    try {
      if (!credential || credential.userId !== userId) {
        if (required) throw Error('FACE_DEVICE_MISSING');
        return;
      }
      await fs.unlink(path.join(STORE, deviceId + '.json'));
      for (const [id, c] of pending) if (c.deviceId === deviceId) pending.delete(id);
      attempts.delete('login:' + deviceId);
    } finally { credential?.embedding.fill(0); }
  });
}
export async function removeFaceDevice(userId: string, deviceId: string, password: unknown) {
  await confirmFacePassword(userId, password);
  await removeOwnedDevice(userId, deviceId, true);
  return { removed: true };
}
export async function removeAllFaceDevices(userId: string, password: unknown) {
  await confirmFacePassword(userId, password);
  for (const deviceId of await credentialIds()) await removeOwnedDevice(userId, deviceId, false);
  for (const [id, c] of pending) if (c.userId === userId) pending.delete(id);
  return { removed: true };
}
