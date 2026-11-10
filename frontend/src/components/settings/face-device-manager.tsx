"use client";

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/components/i18n/language-provider';
import { apiClient, ApiError } from '@/lib/api-client';
import { onStoredAuthCleared, onAuthSessionChanged } from '@/lib/auth';
import type { TranslationKey } from '@/i18n';

export type RegisteredFaceDevice = {
  deviceId: string;
  browser: 'edge' | 'chrome' | 'firefox' | 'safari' | 'opera' | 'samsung' | 'unknown';
  platform: 'windows' | 'macos' | 'android' | 'ios' | 'linux' | 'unknown';
  createdAt: string;
  lastUsedAt: string | null;
};
type Props = { accountMode?: boolean; ownerId: string; currentDeviceId: string | null; registered: boolean; onRemoved: (deviceId: string | null) => Promise<void> };

export function FaceDeviceManager({ ownerId, currentDeviceId, registered, onRemoved, accountMode = false }: Props) {
  const { t, formatDate } = useLanguage();
  const [devices, setDevices] = useState<RegisteredFaceDevice[]>([]);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(false), [revision, setRevision] = useState(0);
  const [target, setTarget] = useState<RegisteredFaceDevice | 'all' | null>(null);
  const [password, setPassword] = useState(''), [busy, setBusy] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null), [notice, setNotice] = useState<TranslationKey | null>(null);
  const operation = useRef<AbortController | null>(null), generation = useRef(0);
  useEffect(() => {
    const abort = new AbortController(), own = ++generation.current;
    setLoading(true); setLoadError(false); setDevices([]); setTarget(null); setPassword(''); setError(null);
    void apiClient<{ devices: RegisteredFaceDevice[] }>('/face-login/devices', { signal: abort.signal })
      .then(result => { if (own === generation.current && !abort.signal.aborted) setDevices(result.devices); })
      .catch(() => { if (own === generation.current && !abort.signal.aborted) setLoadError(true); })
      .finally(() => { if (own === generation.current && !abort.signal.aborted) setLoading(false); });
    const invalidate = () => {
      ++generation.current; abort.abort(); operation.current?.abort(); operation.current = null;
      setDevices([]); setTarget(null); setPassword(''); setBusy(false); setNotice(null);
    };
    const offClear = onStoredAuthCleared(invalidate), offChange = onAuthSessionChanged(invalidate);
    return () => { invalidate(); offClear(); offChange(); };
  }, [ownerId, registered, revision]);

  const label = (item: RegisteredFaceDevice) => {
    const browser = t(`faceDevices.browser_${item.browser}`);
    return item.platform === 'unknown' ? browser : t('faceDevices.deviceName', { browser, platform: t(`faceDevices.platform_${item.platform}`) });
  };
  const select = (item: RegisteredFaceDevice | 'all') => { setTarget(item); setPassword(''); setError(null); setNotice(null); };
  const remove = async () => {
    if (!target || !password || operation.current) return;
    const abort = new AbortController(), own = generation.current, selectedId = target === 'all' ? null : target.deviceId;
    operation.current = abort; setBusy(true); setError(null); setNotice(null);
    try {
      await apiClient(selectedId ? '/face-login/device/remove' : '/face-login/devices/remove-all', {
        method: 'POST', signal: abort.signal, body: JSON.stringify({ password, ...(selectedId ? { deviceId: selectedId } : {}) }),
      });
      if (own !== generation.current || abort.signal.aborted) return;
      setDevices(previous => selectedId ? previous.filter(item => item.deviceId !== selectedId) : []);
      setTarget(null); setNotice(selectedId ? (accountMode ? 'faceAccount.removedOne' : 'faceDevices.removedOne') : accountMode ? 'faceAccount.removedAll' : 'faceDevices.removedAll');
      await onRemoved(selectedId);
    } catch (value) {
      if (own !== generation.current || abort.signal.aborted) return;
      const code = value instanceof ApiError ? value.code : value instanceof Error ? value.message : '';
      setError(code === 'FACE_PASSWORD_INVALID' ? 'faceLogin.FACE_PASSWORD_INVALID'
        : code === 'FACE_RATE_LIMIT' ? 'faceLogin.FACE_RATE_LIMIT'
        : code === 'FACE_DEVICE_MISSING' ? 'faceDevices.deviceGone' : 'faceDevices.removeFailed');
    } finally {
      if (own === generation.current && !abort.signal.aborted) { operation.current = null; setBusy(false); setPassword(''); }
    }
  };

  return <section className="space-y-4 border-t pt-5" aria-labelledby="face-devices-heading">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 id="face-devices-heading" className="font-semibold">{t(accountMode ? 'faceAccount.registrations' : 'faceDevices.title')}</h2>
        <p className="text-sm text-muted-foreground">{t(accountMode ? 'faceAccount.registrationHelp' : 'faceDevices.description')}</p>
      </div>
      <Button type="button" variant="outline" onClick={() => setRevision(value => value + 1)} disabled={loading || busy}>{t('faceDevices.refresh')}</Button>
    </div>
    {loading && <p role="status" className="text-sm text-muted-foreground">{t(accountMode?'faceAccount.loading':'faceDevices.loading')}</p>}
    {loadError && <p role="alert" className="text-sm text-destructive">{t(accountMode?'faceAccount.loadFailed':'faceDevices.loadFailed')}</p>}
    {!loading && !loadError && devices.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t(accountMode ? 'faceAccount.empty' : 'faceDevices.empty')}</p>}
    {!loading && !loadError && devices.length > 0 && <ul className="space-y-3" aria-label={t(accountMode ? 'faceAccount.registrations' : 'faceDevices.title')}>
      {devices.map((item,index) => <li key={item.deviceId} className="space-y-3 rounded-lg border bg-muted/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{accountMode?t('faceAccount.registrationTitle',{number:devices.length>1?index+1:''}).trim():label(item)}</span>
            {!accountMode && item.deviceId === currentDeviceId && <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">{t(accountMode ? 'faceAccount.current' : 'faceDevices.current')}</span>}
          </div>
          <Button type="button" variant="outline" disabled={busy} onClick={() => select(item)} aria-label={t(accountMode?'faceAccount.removeNamed':'faceDevices.removeNamed', { name: label(item),number:index+1 })}>{t(accountMode?'faceAccount.removeRegistration':'faceDevices.remove')}</Button>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">{t('faceDevices.createdAt')}</dt><dd>{formatDate(item.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
          <div><dt className="text-muted-foreground">{t('faceDevices.lastUsedAt')}</dt><dd>{item.lastUsedAt ? formatDate(item.lastUsedAt, { dateStyle: 'medium', timeStyle: 'short' }) : t('faceDevices.notRecorded')}</dd></div>
        </dl>
      </li>)}
    </ul>}
    {!loading && !loadError && devices.length > 0 && <Button type="button" variant="outline" disabled={busy} className="h-auto whitespace-normal text-left" onClick={() => select('all')}>{t(accountMode ? 'faceAccount.removeAll' : 'faceLogin.removeAll')}</Button>}
    {target && <form className="space-y-3 rounded-lg border p-4" aria-label={t('faceDevices.confirmTitle')} onSubmit={event => { event.preventDefault(); void remove(); }}>
      <p className="font-medium">{target === 'all' ? t(accountMode ? 'faceAccount.confirmAll' : 'faceDevices.confirmAll') : t(accountMode ? 'faceAccount.confirmOne' : 'faceDevices.confirmOne', { name: label(target) })}</p>
      <p className="text-sm text-muted-foreground">{t(accountMode ? 'faceAccount.removeHelp' : 'faceDevices.removeHelp')}</p>
      <div className="max-w-sm space-y-2">
        <label htmlFor="face-device-password" className="text-sm font-medium">{t('faceLogin.password')}</label>
        <Input id="face-device-password" type="password" autoComplete="current-password" required disabled={busy} value={password} onChange={event => setPassword(event.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!password || busy}>{t(busy ? 'faceLogin.removing' : 'faceDevices.confirmRemove')}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => { setTarget(null); setPassword(''); setError(null); }}>{t('common.cancel')}</Button>
      </div>
    </form>}
    {notice && <p role="status" className="text-sm text-success">{t(notice)}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
    {!accountMode && !loading && !loadError && devices.some(item => !item.lastUsedAt) && <p className="text-xs leading-5 text-muted-foreground">{t('faceDevices.historyHelp')}</p>}
  </section>;
}
