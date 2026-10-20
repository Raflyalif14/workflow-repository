"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/components/auth/auth-provider';
import { useLanguage } from '@/components/i18n/language-provider';
import { apiClient, ApiError } from '@/lib/api-client';
import { onStoredAuthCleared, onAuthSessionChanged } from '@/lib/auth';
import { useCameraPreview, type CameraError } from '@/hooks/use-camera-preview';
import { useFaceCaptureCountdown } from '@/hooks/use-face-capture-countdown';
import { captureFaceFrame, faceProof, getFaceDevice, newFaceDevice, saveFaceDevice, FaceChallenge, FaceDevice } from '@/lib/face-login-device';
import { captureFaceBurst } from '@/lib/face-passive-test';
import { FaceDeviceManager } from '@/components/settings/face-device-manager';
import type { TranslationKey } from '@/i18n';

const knownErrors = ['FACE_DISABLED', 'FACE_ACCESS_DENIED', 'FACE_DEVICE_INVALID', 'FACE_DEVICE_MISSING', 'FACE_DEVICE_EXISTS', 'FACE_STORE_UNAVAILABLE',
  'FACE_PASSWORD_INVALID', 'FACE_RATE_LIMIT', 'FACE_BUSY', 'FACE_CHALLENGE_EXPIRED', 'FACE_IMAGE_INVALID', 'FACE_INPUT_LIMIT', 'FACE_NONE', 'FACE_MULTIPLE',
  'FACE_POSITION_REQUIRED', 'FACE_LIVENESS_FAILED', 'FACE_MOTION_REQUIRED', 'FACE_NO_MATCH', 'FACE_AUTH_UNAVAILABLE', 'FACE_PROCESS_FAILED', 'FACE_DEVICE_UNAVAILABLE', 'FACE_DEVICE_OTHER', 'FACE_SCAN_INTERRUPTED'];
export function FaceLogin({ enrollment = false }: { enrollment?: boolean }) {
  const { user, completeFaceLogin } = useAuth(), { t } = useLanguage();
  const owner = enrollment ? user?.id || null : 'camera-login';
  const eligible = enrollment ? !!user?.isActive && !user.mustChangePassword : !user;
  const camera = useCameraPreview(owner, eligible);
  const [enabled, setEnabled] = useState(false), [device, setDevice] = useState<FaceDevice | null>(null);
  const [loadingDevice, setLoadingDevice] = useState(true), [loadAttempt, setLoadAttempt] = useState(0);
  const [singleGlance, setSingleGlance] = useState(false);
  const [cameraFailure, setCameraFailure] = useState<CameraError | null>(null);
  const [phase, setPhase] = useState<'idle' | 'starting' | 'capture' | 'scanning' | 'checking' | 'done'>('idle');
  const [step, setStep] = useState(0), [password, setPassword] = useState(''), [error, setError] = useState('');
  const [removed, setRemoved] = useState(false);
  const [challenge, setChallenge] = useState<FaceChallenge | null>(null);
  const flight = useRef<AbortController | null>(null), generation = useRef(0), frames = useRef<Blob[]>([]), capturing = useRef(false);
  const captureSession = useRef<number | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const [capturingNow, setCapturingNow] = useState(false);
  const [automatic, setAutomatic] = useState(true);
  const { stop: stopCamera } = camera;
  const cancel = useCallback(() => { ++generation.current; captureSession.current = null; flight.current?.abort(); flight.current = null; frames.current = []; capturing.current = false; setCapturingNow(false); stopCamera(); setChallenge(null); setPhase('idle'); setStep(0); setPassword(''); setRemoved(false); }, [stopCamera]);
  const errorText = (value: unknown) => {
    const code = value instanceof ApiError ? value.code : value instanceof Error ? value.message : undefined;
    return knownErrors.includes(code || '') ? code! : 'FACE_PROCESS_FAILED';
  };
  useEffect(() => {
    const abort = new AbortController(); let current = true;
    setEnabled(false); setLoadingDevice(true); setError('');
    void (async () => {
      const info = await apiClient<{ enabled: boolean; singleGlance?: boolean }>('/face-login/capabilities', { signal: abort.signal });
      if (!current || !info.enabled) return;
      let stored = await getFaceDevice();
      if (enrollment && stored && (!stored.owner || stored.owner === owner)) {
        const state = await apiClient<{ registered: boolean }>(`/face-login/device/${stored.id}`, { signal: abort.signal });
        if (state.registered !== stored.registered) { stored = { ...stored, registered: state.registered, owner: state.registered ? owner! : undefined }; await saveFaceDevice(stored); }
      }
      if (current) { setDevice(stored); setSingleGlance(info.singleGlance === true); setEnabled(true); }
    })().catch(value => { if (current && !abort.signal.aborted) setError(errorText(value)); })
      .finally(() => { if (current) setLoadingDevice(false); });
    const invalidate = () => { current = false; abort.abort(); cancel(); setEnabled(false); };
    const offClear = onStoredAuthCleared(invalidate), offChange = onAuthSessionChanged(invalidate);
    window.addEventListener('pagehide', invalidate);
    return () => { invalidate(); offClear(); offChange(); window.removeEventListener('pagehide', invalidate); };
  }, [owner, enrollment, loadAttempt, cancel]);
  const submit = async (captured: Blob[], currentDevice: FaceDevice, currentChallenge: FaceChallenge, abort: AbortController, own: number) => {
    captureSession.current = null; camera.stop(); setPhase('checking');
    const proof = await faceProof(currentDevice, currentChallenge, captured);
    if (own !== generation.current || abort.signal.aborted) return;
    const body = new FormData(); body.append('proof', JSON.stringify(proof)); captured.forEach((blob, i) => body.append('frames', blob, `frame-${i}.png`));
    const result = await apiClient<any>(`/face-login/${enrollment ? 'enroll' : 'login'}/finish`, { method: 'POST', body, signal: abort.signal });
    if (own !== generation.current || abort.signal.aborted) return;
    if (enrollment) {
      if (result.registered !== true || result.deviceId !== currentDevice.id) throw Error('FACE_PROCESS_FAILED');
      const saved = { ...currentDevice, registered: true, owner: owner! }; await saveFaceDevice(saved);
      if (own !== generation.current) return; setDevice(saved); setPhase('done');
    } else { completeFaceLogin(result); setPhase('done'); }
  };
  const start = async () => {
    if (flight.current || !enabled || !eligible) return;
    const own = ++generation.current, abort = new AbortController(); flight.current = abort;
    const timeout = setTimeout(() => { if (own === generation.current) { cancel(); setError('FACE_SCAN_INTERRUPTED'); } }, 40000);
    let burst: Blob[] = [];
    setError(''); setCameraFailure(null); setRemoved(false); setPhase('starting'); captureSession.current = null; frames.current = []; setStep(0);
    try {
      let currentDevice = device;
      if (enrollment) {
        if (currentDevice?.registered && currentDevice.owner !== owner) throw Error('FACE_DEVICE_OTHER');
        currentDevice ||= await newFaceDevice();
      }
      if (!currentDevice || !enrollment && !currentDevice.registered) throw Error('FACE_DEVICE_MISSING');
      if (own !== generation.current || abort.signal.aborted) return;
      const value = await apiClient<FaceChallenge>(`/face-login/${enrollment ? 'enroll' : 'login'}/start`, {
        method: 'POST', signal: abort.signal, body: JSON.stringify({ deviceId: currentDevice.id, ...(enrollment ? { password, publicKey: currentDevice.publicKey } : {}) }),
      });
      setPassword('');
      if (own !== generation.current || abort.signal.aborted) return;
      if (enrollment ? value.action !== 'enroll' : !['login', 'login-passive'].includes(value.action)) throw Error('FACE_PROCESS_FAILED');
      setDevice(currentDevice); setChallenge(value); await camera.start();
      if (own !== generation.current || abort.signal.aborted) return;
      if (value.action === 'login-passive') {
        if (!camera.videoRef.current) throw Error('FACE_DEVICE_UNAVAILABLE');
        setPhase('scanning');
        burst = await captureFaceBurst(camera.videoRef.current, abort.signal);
        if (own !== generation.current || abort.signal.aborted) return;
        await submit(burst, currentDevice, value, abort, own);
      } else { captureSession.current = own; setPhase('capture'); }
    } catch (value) { if (own === generation.current) { setError(errorText(value)); setPhase('idle'); setPassword(''); } }
    finally { clearTimeout(timeout); burst.length = 0; if (own === generation.current) { flight.current = null; if (captureSession.current !== own) camera.stop(); } }
  };
  const capture = async () => {
    if (captureSession.current !== generation.current || phase !== 'capture' || !eligible || document.visibilityState === 'hidden' || capturing.current || flight.current || !device || !challenge || !camera.videoRef.current || camera.status !== 'on') return;
    capturing.current = true; setCapturingNow(true); const own = generation.current;
    try {
      const frame = await captureFaceFrame(camera.videoRef.current);
      if (own !== generation.current) return;
      frames.current.push(frame);
      if (frames.current.length < 3) { setStep(frames.current.length); return; }
      const abort = new AbortController(); flight.current = abort;
      const timeout = setTimeout(() => abort.abort(), 25000);
      try {
        await submit([...frames.current], device, challenge, abort, own);
      } finally { clearTimeout(timeout); if (own === generation.current) { flight.current = null; frames.current = []; } }
    } catch (value) { if (own === generation.current) { captureSession.current = null; setError(errorText(value)); camera.stop(); frames.current = []; setPhase('idle'); } }
    finally { if (own === generation.current) { capturing.current = false; setCapturingNow(false); } }
  };
  const countdown = useFaceCaptureCountdown(phase === 'capture' && automatic && !capturingNow && camera.status === 'on' && eligible, step, () => void capture());
  useEffect(() => {
    // Opening the preview expands the card below the login form. Keep the
    // pose instruction visible before the first automatic capture.
    if (phase === 'capture' || phase === 'scanning') sectionRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, [phase]);
  useEffect(() => {
    if (camera.status === 'error' && (flight.current || captureSession.current !== null)) {
      setCameraFailure(camera.error || 'failed'); cancel();
    }
  }, [camera.status, camera.error, cancel]);
  useEffect(() => {
    if (phase !== 'capture' || !challenge) return;
    const expire = () => { cancel(); setError('FACE_CHALLENGE_EXPIRED'); };
    const remaining = Date.parse(challenge.expiresAt) - Date.now();
    const timeout = setTimeout(expire, Number.isFinite(remaining) ? Math.max(0, remaining) : 0);
    return () => clearTimeout(timeout);
  }, [phase, challenge, cancel]);
  const devicesRemoved = async (deviceId: string | null) => {
    if (!device || deviceId && deviceId !== device.id || device.owner && device.owner !== owner) return;
    const own = generation.current, saved = { ...device, registered: false, owner: undefined };
    // Server revocation is authoritative even if this browser cannot update its local cache.
    try { await saveFaceDevice(saved); } catch { /* The next server status check reconciles the local record. */ }
    if (own !== generation.current) return;
    setDevice(saved); setPhase('idle'); setRemoved(true);
  };
  if (!eligible || !enabled && !enrollment) return null;
  const ownRegistration = device?.registered && device.owner === owner;
  const otherRegistration = enrollment && device?.registered && device.owner !== owner;
  const active = ['starting', 'capture', 'scanning', 'checking'].includes(phase);
  const setupReady = enrollment && enabled && !active && !ownRegistration && !otherRegistration;
  const instruction = step === 0 ? 'center' : step === 2 ? 'returnCenter' : challenge?.direction || 'center';
  return <section ref={sectionRef} className="space-y-4 rounded-xl border p-4" aria-label={t('faceLogin.title')}>
    {!enrollment && <>
      <h2 className="font-semibold">{t('faceLogin.title')}</h2>
      <p className="text-sm leading-6 text-muted-foreground">{t(singleGlance ? 'faceLogin.singleGlanceHelp' : 'faceLogin.loginHelp')}</p>
    </>}
    {enrollment && loadingDevice && <p role="status" className="text-sm">{t('faceLogin.loadingStatus')}</p>}
    {enrollment && !loadingDevice && !enabled && !error && <p role="status" className="text-sm">{t('faceLogin.disabled')}</p>}
    {enrollment && removed && <p role="status" className="text-sm text-success">{t('faceLogin.removed')}</p>}
    {enrollment && enabled && ownRegistration && !active && <div className="space-y-4">
      <div role="status" className="flex items-start gap-3 rounded-lg border border-success/25 bg-success/5 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
        <div className="space-y-1">
          <h2 className="font-semibold">{t(phase === 'done' ? 'faceLogin.enrolled' : 'faceLogin.activeTitle')}</h2>
          <p className="text-sm">{t('faceLogin.alreadySetUp')}</p>
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="font-medium">{t('faceLogin.nextLogin')}</h3>
        <p className="text-sm leading-6">{t(singleGlance ? 'faceLogin.nextLoginSingle' : 'faceLogin.nextLoginMotion')}</p>
        <p className="text-xs leading-5 text-muted-foreground">{t('faceLogin.browserScope')}</p>
      </div>
      <Link href="/" className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-deep">
        {t(phase === 'done' ? 'faceLogin.finishSetup' : 'faceLogin.backHome')}
      </Link>
    </div>}
    {setupReady && <>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{t('faceLogin.setupTitle')}</h2>
        <ol className="grid gap-3 sm:grid-cols-3" aria-label={t('faceLogin.setupSteps')}>
          {(['accountStep', 'cameraStep', 'readyStep'] as const).map((key, i) => <li key={key} className="space-y-2 rounded-lg bg-muted/50 p-3">
            <span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{i+1}</span>
            <p className="text-sm font-semibold">{t(`faceLogin.${key}`)}</p>
            <p className="text-sm leading-5 text-muted-foreground">{t(key === 'readyStep'
              ? singleGlance ? 'faceLogin.readyStepSingleHelp' : 'faceLogin.readyStepMotionHelp'
              : `faceLogin.${key}Help`)}</p>
          </li>)}
        </ol>
        <p className="text-sm leading-6">{t(singleGlance ? 'faceLogin.setupOnly' : 'faceLogin.setupMotion')}</p>
        <p className="text-sm text-muted-foreground">{t('faceLogin.cameraPreparation')}</p>
      </div>
      <form className="space-y-3 border-t pt-4" aria-label={t('faceLogin.setupTitle')} onSubmit={e => { e.preventDefault(); if (password) void start(); }}>
        <div className="max-w-sm space-y-2">
          <label htmlFor="face-enroll-password" className="text-sm font-medium">{t('faceLogin.password')}</label>
          <Input id="face-enroll-password" type="password" autoComplete="current-password" required aria-describedby="face-password-help" value={password} onChange={e => setPassword(e.target.value)} />
          <p id="face-password-help" className="text-xs text-muted-foreground">{t('faceLogin.passwordHelp')}</p>
        </div>
        <Button type="submit" disabled={!password}>{t('faceLogin.enroll')}</Button>
      </form>
    </>}
    {enrollment && enabled && otherRegistration && !active && <p role="status" className="text-sm">{t('faceLogin.FACE_DEVICE_OTHER')}</p>}
    {!enrollment && phase === 'done' && <p role="status" className="text-sm text-success">{t('faceLogin.signedIn')}</p>}
    <video ref={camera.videoRef} autoPlay muted playsInline aria-label={t('faceVerification.preview')}
      className={`aspect-[4/3] w-full max-h-80 rounded-lg bg-muted object-contain -scale-x-100 ${phase === 'capture' || phase === 'scanning' ? '' : 'hidden'}`} />
    {phase === 'scanning' && <div role="status" aria-live="polite" className="space-y-2">
      <p className="text-lg font-semibold">{t('faceLogin.scanning')}</p>
      <p className="text-sm text-muted-foreground">{t('faceLogin.scanHold')}</p>
    </div>}
    {phase === 'capture' && <div className="space-y-3">
      <div role="status" aria-live="polite" aria-atomic="true" className="space-y-2">
        {enrollment && <p className="text-sm font-medium text-primary">{t('faceLogin.setupCapture', { step: step+1 })}</p>}
        <p className="text-lg font-semibold">{step+1}/3 · {t(`faceLogin.${instruction}` as TranslationKey)}</p>
        <p className="text-sm text-muted-foreground">{t(automatic ? 'faceLogin.autoHold' : 'faceLogin.hold')}</p>
        {automatic && camera.status === 'on' && <p className="font-medium tabular-nums">
          {t(capturingNow ? 'faceLogin.capturing' : countdown.paused ? 'faceLogin.paused' : 'faceLogin.countdown', { seconds: countdown.seconds })}
        </p>}
      </div>
      {!automatic && <Button type="button" onClick={() => void capture()} disabled={camera.status !== 'on' || capturingNow}>{t('faceLogin.capture')}</Button>}
      <Button type="button" variant="outline" onClick={() => setAutomatic(!automatic)} disabled={capturingNow}>
        {t(automatic ? 'faceLogin.useManual' : 'faceLogin.useAutomatic')}
      </Button>
    </div>}
    {(cameraFailure || camera.error) && <p role="alert" className="text-sm text-destructive">{t(`faceVerification.${cameraFailure || camera.error!}`)}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{t(`faceLogin.${error}` as TranslationKey)}</p>}
    {phase === 'checking' && <p role="status" className="text-sm">{t(enrollment ? 'faceLogin.finishingSetup' : 'faceLogin.checking')}</p>}
    {phase === 'starting' && <p role="status" className="text-sm">{t('faceLogin.starting')}</p>}
    <div className="flex flex-wrap gap-2">
      {!active && enabled && !enrollment && <Button type="button" onClick={() => void start()} disabled={!device?.registered}>{t('faceLogin.signIn')}</Button>}
      {enrollment && !loadingDevice && !enabled && error && <Button type="button" variant="outline" onClick={() => setLoadAttempt(value => value+1)}>{t('faceLogin.retryStatus')}</Button>}
      {active && <Button type="button" variant="outline" onClick={cancel}>{t('common.cancel')}</Button>}
    </div>
    {enrollment && !active && <div className="space-y-3 border-t pt-4">
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">{t('faceLogin.privacyTitle')}</summary>
        <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
          <p>{t('faceLogin.privacy')}</p><p>{t('faceLogin.browserScope')}</p>
        </div>
      </details>
      {enabled && owner && <FaceDeviceManager ownerId={owner} currentDeviceId={device && (!device.owner || device.owner === owner) ? device.id : null}
        registered={Boolean(ownRegistration)} onRemoved={devicesRemoved} />}
    </div>}
    {!enrollment && !device?.registered && <p className="text-xs text-muted-foreground">{t('faceLogin.noDevice')}</p>}
  </section>;
}
