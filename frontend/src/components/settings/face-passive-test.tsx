"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth/auth-provider';
import { useLanguage } from '@/components/i18n/language-provider';
import { useCameraPreview, type CameraError } from '@/hooks/use-camera-preview';
import { onAuthSessionChanged, onStoredAuthCleared } from '@/lib/auth';
import { apiClient, ApiError } from '@/lib/api-client';
import { FaceChallenge, faceProof, getFaceDevice } from '@/lib/face-login-device';
import { captureFaceBurst, FaceSample, PassiveResult, passiveOutcome, validPassiveResult } from '@/lib/face-passive-test';
import { Button } from '@/components/ui/button';
import type { TranslationKey } from '@/i18n';

const samples: FaceSample[] = ['live', 'photo', 'video'];
const knownErrors = ['FACE_DISABLED','FACE_ACCESS_DENIED','FACE_DEVICE_MISSING','FACE_DEVICE_INVALID','FACE_DEVICE_OTHER','FACE_STORE_UNAVAILABLE',
  'FACE_RATE_LIMIT','FACE_BUSY','FACE_CHALLENGE_EXPIRED','FACE_IMAGE_INVALID','FACE_INPUT_LIMIT','FACE_NONE','FACE_MULTIPLE','FACE_POSITION_REQUIRED','FACE_PROCESS_FAILED','FACE_DEVICE_UNAVAILABLE'];
export function FacePassiveTest() {
  const { user } = useAuth(), { t } = useLanguage();
  const eligible = !!user?.isActive && !user.mustChangePassword;
  const camera = useCameraPreview(user?.id || null, eligible);
  const [phase, setPhase] = useState<'idle'|'starting'|'scanning'|'checking'>('idle');
  const [sample, setSample] = useState<FaceSample>('live'), [error, setError] = useState('');
  const [cameraFailure, setCameraFailure] = useState<CameraError | null>(null);
  const [results, setResults] = useState<PassiveResult[]>([]);
  const generation = useRef(0), flight = useRef<AbortController | null>(null), allowed = useRef(false), section = useRef<HTMLElement | null>(null);
  const { stop: stopCamera } = camera;
  const cancel = useCallback(() => { ++generation.current; flight.current?.abort(); flight.current=null; stopCamera(); setPhase('idle'); }, [stopCamera]);
  useEffect(() => {
    allowed.current = eligible; setResults([]); setError(''); setCameraFailure(null);
    const invalidate = () => { allowed.current = false; cancel(); setResults([]); setError(''); setCameraFailure(null); };
    const offClear = onStoredAuthCleared(invalidate), offChange = onAuthSessionChanged(invalidate);
    window.addEventListener('pagehide', invalidate);
    return () => { invalidate(); offClear(); offChange(); window.removeEventListener('pagehide', invalidate); };
  }, [user?.id, eligible, cancel]);
  useEffect(() => { if (phase === 'scanning') section.current?.scrollIntoView({ block:'center', behavior:'instant' }); }, [phase]);
  useEffect(() => { if (camera.status === 'error' && flight.current) { setCameraFailure(camera.error || 'failed'); cancel(); } }, [camera.status, camera.error, cancel]);
  const start = async (kind: FaceSample) => {
    if (flight.current || !eligible || !allowed.current) return;
    const own = ++generation.current, abort = new AbortController(); flight.current = abort;
    const current = () => own === generation.current && !abort.signal.aborted && allowed.current;
    const timeout = setTimeout(() => { if (own === generation.current) { cancel(); setError('interrupted'); } }, 40000);
    let frames: Blob[] = [];
    setSample(kind); setError(''); setCameraFailure(null); setPhase('starting');
    try {
      const device = await getFaceDevice(user?.id);
      if (!current()) return;
      if (!device?.registered) throw Error('FACE_DEVICE_MISSING');
      if (device.owner !== user!.id) throw Error('FACE_DEVICE_OTHER');
      const challenge = await apiClient<FaceChallenge & { sample: FaceSample }>('/face-login/passive-test/start', {
        method:'POST', body:JSON.stringify({ deviceId:device.id, sample:kind }), signal:abort.signal,
      });
      if (!current()) return;
      if (challenge.action !== 'passive-test' || challenge.sample !== kind) throw Error('FACE_PROCESS_FAILED');
      await camera.start();
      if (!current()) return;
      if (!camera.videoRef.current) throw Error('FACE_DEVICE_UNAVAILABLE');
      setPhase('scanning'); frames = await captureFaceBurst(camera.videoRef.current, abort.signal);
      if (!current()) return;
      camera.stop(); setPhase('checking');
      const proof = await faceProof(device, challenge, frames);
      if (!current()) return;
      const body = new FormData(); body.append('proof',JSON.stringify(proof)); frames.forEach((blob,i)=>body.append('frames',blob,`frame-${i}.png`));
      const result = await apiClient<PassiveResult>('/face-login/passive-test/finish',{method:'POST',body,signal:abort.signal});
      if (!current()) return;
      if (!validPassiveResult(result,kind)) throw Error('FACE_PROCESS_FAILED');
      // Keep every completed attempt in this tab; never hide a failed replay by retesting.
      setResults(previous=>[...previous,result]);
    } catch (value) {
      if (own === generation.current && allowed.current) {
        const code = value instanceof ApiError ? value.code : value instanceof Error ? value.message : '';
        setError(abort.signal.aborted || code === 'FACE_SCAN_INTERRUPTED' ? 'interrupted' : knownErrors.includes(code || '') ? code! : 'FACE_PROCESS_FAILED');
      }
    } finally {
      clearTimeout(timeout); frames.length=0;
      if (own === generation.current) { flight.current=null; camera.stop(); setPhase('idle'); }
    }
  };
  const active = phase !== 'idle';
  const attackPassed = results.some(r=>r.sample !== 'live' && r.accepted);
  return <section ref={section} className="space-y-4 rounded-xl border p-4" aria-label={t('facePassive.title')}>
    <h2 className="text-xl font-semibold">{t('facePassive.title')}</h2>
    <p className="text-sm leading-6 text-muted-foreground">{t('facePassive.description')}</p>
    <p className="rounded-lg bg-muted p-3 text-sm leading-6">{t('facePassive.expected')}</p>
    <p className="text-sm leading-6">{t('facePassive.privacy')}</p>
    <div className="space-y-2">
      {samples.map(kind=><div key={kind} className="flex flex-wrap items-center gap-3">
        <Button type="button" variant={kind === 'live' ? 'default' : 'outline'} disabled={active || !eligible} onClick={()=>void start(kind)}>{t(`facePassive.${kind}`)}</Button>
        <p className="text-sm text-muted-foreground">{t(`facePassive.${kind}Help`)}</p>
      </div>)}
    </div>
    <video ref={camera.videoRef} autoPlay muted playsInline aria-label={t('faceVerification.preview')}
      className={`aspect-[4/3] w-full max-h-80 rounded-lg bg-muted object-contain -scale-x-100 ${phase === 'scanning' ? '' : 'hidden'}`} />
    {active && <div role="status" aria-live="polite" className="space-y-2">
      <p className="text-lg font-medium">{t(`facePassive.${phase}`)}</p>
      {phase === 'scanning' && <p>{t(`facePassive.${sample}Help`)}</p>}
    </div>}
    {active && <Button type="button" variant="outline" onClick={cancel}>{t('common.cancel')}</Button>}
    {(cameraFailure || camera.error) && <p role="alert" className="text-sm text-destructive">{t(`faceVerification.${cameraFailure || camera.error!}`)}</p>}
    {error && <div role="alert" className="space-y-1 rounded-lg border p-3 text-sm">
      <p className="font-medium">{t('facePassive.attemptIncomplete', { sample: t(`facePassive.${sample}`) })}</p>
      <p>{t(error === 'interrupted' ? 'facePassive.interrupted'
        : sample !== 'live' && error === 'FACE_POSITION_REQUIRED' ? 'facePassive.screenPosition'
        : sample !== 'live' && error === 'FACE_NONE' ? 'facePassive.screenNoFace'
        : `faceLogin.${error}` as TranslationKey)}</p>
    </div>}
    {attackPassed && <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">{t('facePassive.attackPassed')}</p>}
    {!!results.length && <div className="space-y-3" aria-label={t('facePassive.results')}>
      <h3 className="font-semibold">{t('facePassive.results')}</h3>
      {results.map((result,i)=><article key={i} className="space-y-2 rounded-lg border p-3">
        <p className="font-medium">{i+1}. {t(`facePassive.${result.sample}`)} — {t(`facePassive.${passiveOutcome(result)}`)}</p>
        <p className="text-sm">{t(!result.checks.identity || !result.checks.position ? 'facePassive.inconclusive' : result.sample === 'live'
          ? result.accepted ? 'facePassive.livePassed' : 'facePassive.liveRejected'
          : result.accepted ? 'facePassive.attackPassed' : 'facePassive.attackRejected')}</p>
        {(!result.checks.identity || !result.checks.position) && <p className="text-sm">
          {t(!result.checks.identity && !result.checks.position ? 'facePassive.retryIdentityPosition'
            : !result.checks.identity ? 'facePassive.retryIdentity' : 'facePassive.retryPosition')}
        </p>}
        <details className="text-sm"><summary className="cursor-pointer">{t('facePassive.details')}</summary>
          <dl className="mt-2 grid grid-cols-2 gap-2">
            {(['pad','identity','position'] as const).map(check=><div key={check}><dt>{t(`facePassive.${check}`)}</dt><dd>{t(result.checks[check] ? 'facePassive.pass' : 'facePassive.fail')}</dd></div>)}
          </dl>
          <pre className="mt-2 max-h-64 overflow-auto text-xs">{JSON.stringify({version:result.version,testedAt:result.testedAt,frames:result.frames},null,2)}</pre>
        </details>
      </article>)}
      <p className="text-sm text-muted-foreground">{t('facePassive.limit')}</p>
    </div>}
  </section>;
}
