import crypto from 'node:crypto';
import { runFaceLoginJob } from './run-face-pad-analysis';
import { FACE_LOGIN_VERSION } from './face-login-crypto';

export const PASSIVE_VERSION = 'webcam-passive-evaluation-v1';
export type PassiveFrame = { classes: number[][]; identity: number; consistency: number; yaw: number };
export type PassiveEvaluation = { version: string; accepted: boolean; checks: { pad: boolean; identity: boolean; position: boolean }; frames: PassiveFrame[] };

/** Never returns a credential/session. Decisions are recomputed from every frame. */
export function parsePassiveEvaluation(result: any, frames: Buffer[]): PassiveEvaluation {
  if (result?.status !== 'EVALUATED' || result.version !== PASSIVE_VERSION || frames.length !== 3
    || !Array.isArray(result.hashes) || result.hashes.length !== 3
    || frames.some((f, i) => crypto.createHash('sha256').update(f).digest('hex') !== result.hashes[i])
    || !Array.isArray(result.frames) || result.frames.length !== 3) throw Error('FACE_PROCESS_FAILED');
  const values: PassiveFrame[] = result.frames.map((f: any) => {
    if (!f || !Array.isArray(f.classes) || f.classes.length !== 2 || !f.classes.every((c: unknown) => Array.isArray(c) && c.length === 3
      && c.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1) && Math.abs(c.reduce((a,b)=>a+b,0)-1) < 1e-4)
      || ![f.identity, f.consistency].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1.0001)
      || typeof f.yaw !== 'number' || !Number.isFinite(f.yaw)) throw Error('FACE_PROCESS_FAILED');
    return { classes: f.classes.map((c: number[]) => [...c]), identity: f.identity, consistency: f.consistency, yaw: f.yaw };
  });
  const checks = {
    pad: values.every(f => f.classes.every(c => c[1] > c[0] + c[2])),
    identity: values.every(f => f.identity >= .60 && f.consistency >= .60),
    position: values.every(f => Math.abs(f.yaw) <= .22),
  };
  return { version: PASSIVE_VERSION, accepted: checks.pad && checks.identity && checks.position, checks, frames: values };
}

export async function runFacePassiveInference(frames: Buffer[], template: number[], signal: AbortSignal): Promise<PassiveEvaluation> {
  const header = Buffer.from(JSON.stringify({ lengths: frames.map(f => f.length), direction: 'left', template, mode: 'passive-test' }));
  const size = Buffer.alloc(4); size.writeUInt32BE(header.length); const payload = Buffer.concat([size, header, ...frames]);
  try {
    const result: any = await runFaceLoginJob(payload, signal);
    if (signal.aborted) throw Error('FACE_CHALLENGE_EXPIRED');
    if (result?.status === 'ERROR') throw Error(['FACE_NONE', 'FACE_MULTIPLE', 'FACE_IMAGE_INVALID', 'FACE_INPUT_LIMIT', 'FACE_POSITION_REQUIRED'].includes(result.reason) ? result.reason : 'FACE_PROCESS_FAILED');
    return parsePassiveEvaluation(result, frames);
  } finally { payload.fill(0); header.fill(0); }
}

/** Uses the exact evaluated policy; scores never leave the login endpoint. */
export async function runFacePassiveLoginInference(frames: Buffer[], template: number[], signal: AbortSignal): Promise<void> {
  const result = await runFacePassiveInference(frames, template, signal);
  requirePassiveLogin(result);
}

export function requirePassiveLogin(result: PassiveEvaluation): void {
  if (!result.checks.pad) throw Error('FACE_LIVENESS_FAILED');
  if (!result.checks.identity) throw Error('FACE_NO_MATCH');
  if (!result.checks.position) throw Error('FACE_POSITION_REQUIRED');
  if (!result.accepted) throw Error('FACE_PROCESS_FAILED');
}

export async function runFaceLoginInference(frames: Buffer[], direction: 'left' | 'right', template: number[] | undefined, signal: AbortSignal): Promise<{ embedding: number[] }> {
  const header = Buffer.from(JSON.stringify({ lengths: frames.map(f => f.length), direction, template }));
  const size = Buffer.alloc(4); size.writeUInt32BE(header.length);
  const payload = Buffer.concat([size, header, ...frames]);
  try {
    const result: any = await runFaceLoginJob(payload, signal);
    const errors = ['FACE_NONE', 'FACE_MULTIPLE', 'FACE_IMAGE_INVALID', 'FACE_INPUT_LIMIT', 'FACE_POSITION_REQUIRED', 'FACE_LIVENESS_FAILED', 'FACE_MOTION_REQUIRED', 'FACE_NO_MATCH'];
    if (result?.status === 'ERROR') throw Error(errors.includes(result.reason) ? result.reason : 'FACE_PROCESS_FAILED');
    if (signal.aborted || result?.status !== 'SUCCESS' || result.version !== FACE_LOGIN_VERSION
      || !Array.isArray(result.hashes) || result.hashes.length !== 3 || frames.some((f, i) => crypto.createHash('sha256').update(f).digest('hex') !== result.hashes[i])
      || !Array.isArray(result.embedding) || result.embedding.length !== 128 || !result.embedding.every((n: unknown) => typeof n === 'number' && Number.isFinite(n))
      || Math.abs(Math.hypot(...result.embedding) - 1) > 1e-4) throw Error('FACE_PROCESS_FAILED');
    return { embedding: result.embedding };
  } finally { payload.fill(0); header.fill(0); }
}
