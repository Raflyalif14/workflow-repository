"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient, authorizedFetch, ApiError } from "@/lib/api-client";
import { onAuthSessionChanged, onStoredAuthCleared } from "@/lib/auth";
import type { TemporaryPhoto } from "@/lib/face-photo";

import { readProvenance, safeTrialReasons, trialMetadataError, type ModelProvenance, type SimilarityResult, type TrialAttempt, type TrialMetadata, type TrialReason } from "@/lib/face-experiment-notes";
export type { SimilarityResult } from "@/lib/face-experiment-notes";
class ComparisonFailure extends ApiError {
  constructor(code: string, readonly provenance: ModelProvenance | null) { super("Comparison failed", 503, code); }
}
export const comparisonError = (error: unknown) => {
  const codes = safeTrialReasons;
  return error instanceof ApiError && codes.includes(error.code as TrialReason) ? error.code! : "FACE_SERVICE_UNAVAILABLE";
};
export function useFaceComparison(owner: string | null, eligible: boolean, a: TemporaryPhoto | null, b: TemporaryPhoto | null, metadata: TrialMetadata) {
  const latest = useRef({ owner, eligible, a, b, metadata }); latest.current = { owner, eligible, a, b, metadata };
  const flight = useRef<AbortController | null>(null), generation = useRef(0), pending = useRef(false);
  const revoked = useRef(false);
  const [availability, setAvailability] = useState<"loading" | "enabled" | "disabled" | "error">("loading");
  const [attempt, setAttempt] = useState(0), [busy, setBusy] = useState(false), [consent, setConsent] = useState(false);
  const [result, setResult] = useState<SimilarityResult | null>(null), [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<TrialAttempt | null>(null);
  const resultInput = useRef<{ owner: string | null; a: TemporaryPhoto | null; b: TemporaryPhoto | null; metadata: TrialMetadata } | null>(null);
  const cancel = useCallback(() => {
    ++generation.current; flight.current?.abort(); flight.current = null; pending.current = false;
    setBusy(false); setResult(null); setError(null); setCompleted(null); resultInput.current = null;
  }, []);
  useEffect(() => { cancel(); setConsent(false); }, [owner, eligible, a, b, metadata, cancel]);
  useEffect(() => {
    setAvailability("loading"); if (!owner || !eligible) { setAvailability("disabled"); return; }
    revoked.current = false;
    const abort = new AbortController(); let alive = true;
    void apiClient<{ enabled: boolean }>("/face-experiment/capabilities", { signal: abort.signal }).then(value => {
      if (alive && !revoked.current) setAvailability(value.enabled ? "enabled" : "disabled");
    }).catch(() => { if (alive) setAvailability("error"); });
    const invalidate = () => { revoked.current = true; latest.current.eligible = false; cancel(); setConsent(false); setAvailability("disabled"); };
    const offClear = onStoredAuthCleared(invalidate), offChange = onAuthSessionChanged(invalidate);
    window.addEventListener("pagehide", invalidate);
    return () => {
      alive = false; abort.abort(); ++generation.current; flight.current?.abort(); flight.current = null; pending.current = false;
      offClear(); offChange(); window.removeEventListener("pagehide", invalidate);
    };
  }, [owner, eligible, attempt, cancel]);
  const compare = useCallback(async () => {
    const input = { ...latest.current };
    if (revoked.current || !input.eligible || !input.owner || !input.a || !input.b || !consent || availability !== "enabled" || pending.current || trialMetadataError(input.metadata)) return;
    pending.current = true; const own = ++generation.current, abort = new AbortController(), id = crypto.randomUUID(); flight.current = abort;
    const current = () => !revoked.current && own === generation.current && latest.current.eligible && latest.current.owner === input.owner
      && latest.current.a === input.a && latest.current.b === input.b && latest.current.metadata === input.metadata;
    setBusy(true); setResult(null); setError(null); setCompleted(null); resultInput.current = null;
    const timer = setTimeout(() => abort.abort(), 20000);
    try {
      if ([input.a, input.b].some(p => p.blob.size > 4 * 1024 * 1024 || p.width > 4096 || p.height > 4096 || p.width * p.height > 8000000)) throw new ComparisonFailure("FACE_INPUT_LIMIT", null);
      const form = new FormData(); form.append("photoA", input.a.blob, "photo-a.png"); form.append("photoB", input.b.blob, "photo-b.png");
      // Reuse the existing authenticated transport; only project safe experiment fields.
      const response = await authorizedFetch("/face-experiment/compare", { method: "POST", body: form, signal: abort.signal });
      const envelope = await response.json();
      if (!response.ok) throw new ComparisonFailure(envelope.errors?.code, readProvenance(envelope.errors?.provenance));
      const value = envelope.data;
      const provenance = readProvenance(value?.provenance);
      if (!Number.isFinite(value?.score) || value.score < -1 || value.score > 1 || value.model !== "opencv-sface-2021dec" || value.metric !== "cosine" || !provenance) throw Error("Invalid result");
      if (current()) {
        const result: SimilarityResult = { model: value.model, metric: value.metric, score: value.score, provenance };
        resultInput.current = input; setResult(result);
        setCompleted({ id, completedAt: new Date().toISOString(), metadata: { ...input.metadata }, outcome: "SUCCESS", result, reason: null, provenance });
      }
    } catch (error) {
      if (current()) {
        const reason = (abort.signal.aborted ? "FACE_TIMEOUT" : comparisonError(error)) as TrialReason;
        resultInput.current = input; setError(reason);
        setCompleted({ id, completedAt: new Date().toISOString(), metadata: { ...input.metadata }, outcome: "FAILED", result: null, reason,
          provenance: error instanceof ComparisonFailure ? error.provenance : null });
      }
    }
    finally { clearTimeout(timer); if (own === generation.current) { pending.current = false; flight.current = null; setBusy(false); } }
  }, [availability, consent]);
  const visible = resultInput.current?.owner === owner && resultInput.current.a === a && resultInput.current.b === b && resultInput.current.metadata === metadata && eligible && !revoked.current;
  return { availability, busy, consent, setConsent, result: visible ? result : null, error: visible ? error : null, completed: visible ? completed : null, compare, cancel, retryAvailability: () => setAttempt(n => n + 1) };
}
