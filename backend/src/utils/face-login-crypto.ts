import crypto from 'node:crypto';

export const FACE_LOGIN_VERSION = 'webcam-device-minifas-sface-v1';
export const deviceIdValid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
export type DevicePublicKey = { kty: 'EC'; crv: 'P-256'; x: string; y: string };
export function readDeviceKey(v: any): DevicePublicKey {
  if (v?.kty !== 'EC' || v.crv !== 'P-256' || ![v.x, v.y].every(s => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s)) || v.d !== undefined) throw Error('FACE_DEVICE_INVALID');
  const key: DevicePublicKey = { kty: 'EC', crv: 'P-256', x: v.x, y: v.y };
  crypto.createPublicKey({ key, format: 'jwk' }); return key;
}
export function proofMessage(challengeId: string, nonce: string, action: string, deviceId: string, hashes: string[]) {
  return JSON.stringify([FACE_LOGIN_VERSION, challengeId, nonce, action, deviceId, hashes]);
}
export function checkDeviceProof(key: DevicePublicKey, message: string, signature: unknown) {
  if (typeof signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(signature)) return false;
  try { return crypto.verify('sha256', Buffer.from(message), { key: crypto.createPublicKey({ key, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')); }
  catch { return false; }
}
export function sealCredential(value: unknown, deviceId: string, key: Buffer) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(FACE_LOGIN_VERSION + ':' + deviceId));
  const plain = Buffer.from(JSON.stringify(value));
  try { const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    return JSON.stringify({ v: 1, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), ciphertext: ciphertext.toString('base64url') });
  } finally { plain.fill(0); }
}
export function openCredential(value: string, deviceId: string, key: Buffer): any {
  const item = JSON.parse(value); if (item.v !== 1) throw Error('FACE_STORE_UNAVAILABLE');
  const iv = Buffer.from(item.iv, 'base64url'), tag = Buffer.from(item.tag, 'base64url');
  if (iv.length !== 12 || tag.length !== 16) throw Error('FACE_STORE_UNAVAILABLE');
  const cipher = crypto.createDecipheriv('aes-256-gcm', key, iv); cipher.setAAD(Buffer.from(FACE_LOGIN_VERSION + ':' + deviceId)); cipher.setAuthTag(tag);
  const plain = Buffer.concat([cipher.update(Buffer.from(item.ciphertext, 'base64url')), cipher.final()]);
  try { return JSON.parse(plain.toString('utf8')); } finally { plain.fill(0); }
}
