"use client";

import { useEffect, useRef, useState } from 'react';
import { createProjectDraftSession, DraftConflictError, hasProjectFormValues, type ProjectFormDraft, type ProjectFormValues, type ProjectDraftSubmission } from '@/lib/project-form-draft';
import { getAuthSession, isCurrentSession } from '@/lib/auth';
import { SessionChangedError } from '@/lib/api-client';

export type ProjectDraftStatus = 'loading' | 'empty' | 'saving' | 'saved' | 'error' | 'conflict';
export function useProjectFormDraft(accountId: string, values: ProjectFormValues, restore: (draft: ProjectFormDraft | null) => void) {
  const [status, setStatus] = useState<ProjectDraftStatus>('loading');
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const session = useRef<ReturnType<typeof createProjectDraftSession> | null>(null);
  const latest = useRef(values); latest.current = values;
  const restoreCurrent = useRef(restore); restoreCurrent.current = restore;
  const submission = useRef<ProjectDraftSubmission | undefined>(undefined);
  const finished = useRef(false);
  const generation = useRef(0);
  const sequence = useRef(0);
  const loadedValues = useRef<ProjectFormValues | null>(null);
  const ownerSession = useRef(getAuthSession());

  const failure = (error: unknown) => setStatus(error instanceof DraftConflictError ? 'conflict' : 'error');
  const load = async () => {
    const current = ++generation.current;
    session.current?.close();
    const active = createProjectDraftSession(accountId); session.current = active;
    setStatus('loading'); setReady(false);
    try {
      if (!ownerSession.current || !isCurrentSession(ownerSession.current)) throw new SessionChangedError();
      const draft = await active.load();
      if (generation.current !== current) return;
      if (!isCurrentSession(ownerSession.current)) throw new SessionChangedError();
      submission.current = draft?.submission;
      loadedValues.current = draft?.values || null; restoreCurrent.current(draft);
      setRestored(Boolean(draft)); setSavedAt(draft?.savedAt || null);
      setStatus(draft ? 'saved' : 'empty'); setReady(true);
    } catch (error) { if (generation.current === current) failure(error); }
  };

  const detach = () => { ++generation.current; session.current = null; };
  useEffect(() => {
    void load();
    // Let queued writes for this account finish when navigating inside the app.
    return detach;
    // The page remounts this hook under the verified account key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const save = async (snapshot: ProjectFormValues, frozen = submission.current) => {
    if (finished.current || !session.current) return null;
    const current = generation.current, ticket = ++sequence.current;
    setStatus('saving');
    try {
      const draft = await session.current.save(hasProjectFormValues(snapshot) ? snapshot : null, frozen);
      if (generation.current === current && sequence.current === ticket) {
        setSavedAt(draft?.savedAt || null); setStatus(draft ? 'saved' : 'empty');
      }
      return draft;
    } catch (error) { if (generation.current === current) failure(error); throw error; }
  };

  useEffect(() => {
    if (!ready || finished.current || submission.current || status === 'conflict') return;
    // Restoring field setters creates a new envelope, but File references stay intact.
    const restoredFields = loadedValues.current;
    if (restoredFields && Object.keys(values).every(key => values[key as keyof ProjectFormValues] === restoredFields[key as keyof ProjectFormValues])) {
      loadedValues.current = null; return;
    }
    loadedValues.current = null;
    void save(values).catch(() => undefined);
    // Saving status updates must not enqueue duplicate writes for unchanged inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, values.name, values.customer, values.scenarioId, values.estimatedRevenue, values.selectedOptionalKeys, values.mom, values.photos, values.documents]);

  return {
    status, ready, restored, savedAt,
    assertCurrent: () => { if (!ownerSession.current || !isCurrentSession(ownerSession.current)) throw new SessionChangedError(); },
    retry: () => ready ? save(latest.current).catch(() => undefined) : load(),
    reload: load,
    freeze: async (snapshot: ProjectFormValues, keys: string[]) => {
      const current = generation.current;
      const owner = ownerSession.current;
      if (!owner || !isCurrentSession(owner)) throw new SessionChangedError();
      const captured = submission.current || { requestId: crypto.randomUUID(), selectedDocumentKeys: keys };
      submission.current = captured;
      // Must finish before the first POST. Reload can then retry the same operation and bytes.
      await save(snapshot, captured);
      if (generation.current !== current || !isCurrentSession(owner)) throw new SessionChangedError();
      return captured;
    },
    discard: async () => {
      if (submission.current) return false;
      try { await session.current!.save(null); } catch (error) { failure(error); throw error; }
      ++sequence.current;
      setRestored(false); setSavedAt(null); setStatus('empty'); restoreCurrent.current(null);
      return true;
    },
    complete: async () => {
      finished.current = true;
      // A retained frozen draft is safe to retry if local cleanup fails after server success.
      try { await session.current?.save(null); } catch { /* Backend receipt remains authoritative. */ }
    },
  };
}
