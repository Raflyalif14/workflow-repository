export const SESSION_IDLE_MS = 30 * 60_000;
const KEEP_ALIVE_MS = 5 * 60_000;
export const SESSION_ACTIVITY_KEY = 'workflow.sessionActivity';

// Browser inactivity UX; the server remains authoritative about token validity.
export function startSessionActivity({ sessionId, isCurrent, onExpired, keepAlive, now = Date.now }: {
  sessionId: string; isCurrent: () => boolean; onExpired: () => void;
  keepAlive: () => Promise<void>; now?: () => number;
}) {
  let stopped = false, refreshing = false, lastPing = -Infinity, lastEvent = -Infinity;
  const read = (): number | null => {
    try {
      const value = JSON.parse(window.localStorage.getItem(SESSION_ACTIVITY_KEY) || 'null');
      return value?.sessionId === sessionId && Number.isFinite(value.at) && value.at >= 0 && value.at <= now() ? value.at : null;
    } catch { return null; }
  };
  let lastActivity = read() ?? now();
  let lastWritten = -Infinity;
  const write = () => {
    if (stopped || !isCurrent()) return;
    try { window.localStorage.setItem(SESSION_ACTIVITY_KEY, JSON.stringify({sessionId, at:lastActivity})); lastWritten=now(); }
    catch { /* An in-memory timer still works when site storage is unavailable. */ }
  };
  const check = () => {
    if (stopped || !isCurrent()) return false;
    lastActivity = Math.max(lastActivity, read() ?? lastActivity);
    if (now() - lastActivity >= SESSION_IDLE_MS) {
      stopped = true; onExpired(); return false;
    }
    return true;
  };
  const ping = () => {
    if (document.visibilityState === 'hidden' || !check() || refreshing || now()-lastActivity > KEEP_ALIVE_MS || now()-lastPing < KEEP_ALIVE_MS) return;
    refreshing=true; lastPing=now();
    // Caller verifies the same session before applying any asynchronous result.
    void keepAlive().catch(() => {}).finally(() => { refreshing=false; });
  };
  const activity = () => {
    if (now()-lastEvent < 1000) return;
    lastEvent=now();
    // A click after the idle deadline must not revive the expired session.
    if (!check() || document.visibilityState === 'hidden') return;
    lastActivity=now();
    if (now()-lastWritten >= 1000) write();
    ping();
  };
  const wake = () => { if (document.visibilityState !== 'hidden') ping(); };
  const sync = (event: StorageEvent) => {
    if (event.key === SESSION_ACTIVITY_KEY || event.key === null) check();
  };
  const events = ['pointerdown','pointermove','keydown','input','scroll','touchstart'] as const;
  if (check()) { write(); ping(); }
  events.forEach(event => window.addEventListener(event, activity, {passive:true,capture:true}));
  window.addEventListener('storage', sync);
  window.addEventListener('focus', wake);
  document.addEventListener('visibilitychange', wake);
  const interval=setInterval(() => { if (check()) { if (lastActivity > (read() ?? -Infinity)) write(); ping(); } }, 15_000);
  return () => {
    stopped=true; clearInterval(interval);
    events.forEach(event => window.removeEventListener(event,activity,true));
    window.removeEventListener('storage',sync); window.removeEventListener('focus',wake);
    document.removeEventListener('visibilitychange',wake);
  };
}
