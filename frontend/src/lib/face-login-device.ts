/** Private key is non-exportable and stays in IndexedDB on this browser profile. */
export type FaceDevice = { id: string; privateKey: CryptoKey; publicKey: JsonWebKey; registered: boolean; owner?: string; label?: string };
const DB_NAME = 'workflow-camera-device-v1', STORE = 'device';
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onsuccess = () => resolve(open.result); open.onerror = () => reject(Error('FACE_DEVICE_UNAVAILABLE'));
  });
}
export async function getFaceDevices(): Promise<FaceDevice[]> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve([...new Map((request.result || []).filter((d): d is FaceDevice => d && typeof d.id === 'string' && d.privateKey && d.publicKey).map(d => [d.id, d])).values()]);
    request.onerror = () => reject(Error('FACE_DEVICE_UNAVAILABLE'));
  }); } finally { db.close(); }
}
export async function getFaceDevice(owner?: string): Promise<FaceDevice | null> {
  const devices = await getFaceDevices();
  return (owner ? devices.find(d => d.owner === owner) || devices.find(d => !d.owner && !d.registered) : devices.find(d => d.registered) || devices[0]) || null;
}
export async function saveFaceDevice(device: FaceDevice) {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
    store.put(device, device.owner ? `account:${device.owner}` : `device:${device.id}`);
    if (device.owner) store.delete(`device:${device.id}`);
    const legacy = store.get('current'); legacy.onsuccess = () => { if (legacy.result?.id === device.id) store.delete('current'); };
    tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(Error('FACE_DEVICE_UNAVAILABLE'));
  }); } finally { db.close(); }
}
export async function newFaceDevice(owner?: string, label?: string): Promise<FaceDevice> {
  if (!window.isSecureContext || !crypto.subtle || !window.indexedDB) throw Error('FACE_DEVICE_UNAVAILABLE');
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const device: FaceDevice = { id: crypto.randomUUID(), privateKey: pair.privateKey, publicKey: await crypto.subtle.exportKey('jwk', pair.publicKey), registered: false, ...(owner ? { owner, label } : {}) };
  await saveFaceDevice(device); return device;
}
export type FaceChallenge = { id: string; nonce: string; deviceId: string; action: 'enroll' | 'login' | 'login-passive' | 'passive-test'; direction: 'left' | 'right'; expiresAt: string };
export async function faceProof(device: FaceDevice, challenge: FaceChallenge, frames: Blob[]) {
  const hashes: string[] = [];
  for (const frame of frames) {
    const bytes = new Uint8Array(await frame.arrayBuffer());
    try { hashes.push(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('')); }
    finally { bytes.fill(0); }
  }
  if (challenge.deviceId !== device.id || !['left', 'right'].includes(challenge.direction) || Date.parse(challenge.expiresAt) <= Date.now()) throw Error('FACE_CHALLENGE_EXPIRED');
  const message = JSON.stringify(['webcam-device-minifas-sface-v1', challenge.id, challenge.nonce, challenge.action, device.id, hashes]);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, device.privateKey, new TextEncoder().encode(message)));
  const encoded = btoa(String.fromCharCode(...signature)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return { challengeId: challenge.id, signature: encoded, hashes };
}
export function captureFaceFrame(video: HTMLVideoElement): Promise<Blob> {
  if (video.readyState < 2 || video.videoWidth < 128 || video.videoHeight < 128) return Promise.reject(Error('FACE_POSITION_REQUIRED'));
  const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight)), canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext('2d'); if (!ctx) return Promise.reject(Error('FACE_DEVICE_UNAVAILABLE'));
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.width = canvas.height = 0;
    if (blob && blob.size <= 4*1024*1024) resolve(blob); else reject(Error('FACE_IMAGE_INVALID'));
  }, 'image/png'));
}
