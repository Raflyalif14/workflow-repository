"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthSessionChanged, onStoredAuthCleared } from "@/lib/auth";
import { emptyTrialMetadata, validTrialAttempt, type TrialAttempt, type TrialMetadata } from "@/lib/face-experiment-notes";
const EMPTY_METADATA = emptyTrialMetadata();

export function useFaceExperimentNotes(owner: string | null, eligible: boolean) {
  const fresh = () => ({ owner, metadata: emptyTrialMetadata(), rows: [] as TrialAttempt[] });
  const [state, setState] = useState(fresh);
  const metadata = useRef(state.metadata); metadata.current = state.metadata;
  const bound = useRef(owner), revoked = useRef(false), recorded = useRef(new Set<string>());
  const current = useRef({ owner, eligible }); current.current = { owner, eligible };
  useEffect(() => {
    bound.current = owner; revoked.current = !eligible; recorded.current.clear(); setState(fresh());
    const clear = () => { revoked.current = true; recorded.current.clear(); setState(fresh()); };
    const offClear = onStoredAuthCleared(clear), offChange = onAuthSessionChanged(clear);
    window.addEventListener("pagehide", clear);
    return () => { revoked.current = true; recorded.current.clear(); offClear(); offChange(); window.removeEventListener("pagehide", clear); };
  }, [owner, eligible]);
  const visible = !revoked.current && eligible && owner !== null && state.owner === owner && bound.current === owner;
  const update = useCallback((key: keyof TrialMetadata, value: string) => {
    if (revoked.current || !current.current.eligible || current.current.owner !== bound.current) return;
    const next = { ...metadata.current, [key]: value };
    metadata.current = next;
    setState(s => ({ ...s, metadata: next }));
  }, []);
  const record = useCallback((attempt: TrialAttempt | null) => {
    if (!attempt || revoked.current || !current.current.eligible || current.current.owner !== bound.current || recorded.current.has(attempt.id) || !validTrialAttempt(attempt) || JSON.stringify(attempt.metadata) !== JSON.stringify(metadata.current)) return;
    recorded.current.add(attempt.id); // Synchronous guard survives double click and row deletion.
    setState(s => ({ ...s, rows: [...s.rows, { ...attempt, metadata: { ...attempt.metadata }, provenance: attempt.provenance ? { ...attempt.provenance } : null }] }));
  }, []);
  return { metadata: visible ? state.metadata : EMPTY_METADATA, rows: visible ? state.rows : [], update,
    record, canRecord: (attempt: TrialAttempt | null) => visible && !!attempt && validTrialAttempt(attempt) && !recorded.current.has(attempt.id),
    remove: (id: string) => { if (visible) setState(s => ({ ...s, rows: s.rows.filter(r => r.id !== id) })); } };
}
