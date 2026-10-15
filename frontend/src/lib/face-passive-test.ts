import { captureFaceFrame } from './face-login-device';

export type FaceSample = 'live' | 'photo' | 'video';
export type PassiveResult = {
  version: 'webcam-passive-evaluation-v1'; evaluationOnly: true; sample: FaceSample; testedAt: string; accepted: boolean;
  checks: { pad: boolean; identity: boolean; position: boolean };
  frames: { classes: number[][]; identity: number; consistency: number; yaw: number }[];
};
/** A rejected replay is useful PAD evidence only when identity and pose match. */
export function passiveOutcome(result: Pick<PassiveResult, 'sample' | 'accepted' | 'checks'>) {
  if (result.sample !== 'live' && result.accepted) return 'attackAccepted' as const;
  if (!result.checks.identity || !result.checks.position) return 'inconclusiveTitle' as const;
  if (result.sample === 'live') return result.accepted ? 'liveAccepted' as const : 'liveNotAccepted' as const;
  return result.sample === 'photo' ? 'photoBlocked' as const : 'videoBlocked' as const;
}
export function validPassiveResult(value: any, sample: FaceSample): value is PassiveResult {
  return value?.evaluationOnly === true && value.version === 'webcam-passive-evaluation-v1' && value.sample === sample
    && typeof value.accepted === 'boolean' && Number.isFinite(Date.parse(value.testedAt))
    && ['pad', 'identity', 'position'].every(k => typeof value.checks?.[k] === 'boolean')
    && value.accepted === (value.checks.pad && value.checks.identity && value.checks.position)
    && Array.isArray(value.frames) && value.frames.length === 3
    && value.frames.every((f: any) => [f?.identity, f?.consistency, f?.yaw].every(n => typeof n === 'number' && Number.isFinite(n))
      && Array.isArray(f.classes) && f.classes.length === 2 && f.classes.every((c: any) => Array.isArray(c) && c.length === 3 && c.every((n: any) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)));
}
/** A short continuous capture; fresh video frames only, no best-frame selection. */
export function captureFaceBurst(video: HTMLVideoElement, signal: AbortSignal, capture = captureFaceFrame): Promise<Blob[]> {
  return new Promise((resolve, reject) => {
    let done = false, timer: ReturnType<typeof setTimeout> | undefined, lastTime = video.currentTime;
    let nextAt = performance.now() + 1000;
    const frames: Blob[] = [];
    const finish = (error?: string) => {
      if (done) return; done = true; clearTimeout(timer); clearTimeout(deadline);
      signal.removeEventListener('abort', abort); document.removeEventListener('visibilitychange', visibility);
      if (error) { frames.length = 0; reject(Error(error)); } else resolve(frames);
    };
    const abort = () => finish('FACE_SCAN_INTERRUPTED');
    const interrupted = () => signal.aborted || document.visibilityState === 'hidden';
    const visibility = () => { if (document.visibilityState === 'hidden') abort(); };
    const deadline = setTimeout(() => finish('FACE_SCAN_INTERRUPTED'), 8000);
    const tick = async () => {
      if (done) return;
      if (interrupted()) { abort(); return; }
      if (performance.now() >= nextAt && video.readyState >= 2 && !video.paused && video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        try {
          const frame = await capture(video);
          if (done) return;
          if (interrupted()) { abort(); return; }
          frames.push(frame);
          if (frames.length === 3) { finish(); return; }
          nextAt = performance.now() + 350;
        } catch { finish('FACE_IMAGE_INVALID'); return; }
      }
      timer = setTimeout(() => void tick(), 50);
    };
    signal.addEventListener('abort', abort, { once: true }); document.addEventListener('visibilitychange', visibility);
    void tick();
  });
}
