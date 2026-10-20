"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient, authorizedFetch } from "@/lib/api-client";
import { onAuthSessionChanged, onStoredAuthCleared } from "@/lib/auth";
import type { TemporaryPhoto } from "@/lib/face-photo";
import { emptyPadMetadata, padMetadataValid, padReasons, readPadProvenance, readPadResult, type PadAttempt, type PadMetadata, type PadSlot, type PadReason } from "@/lib/face-pad";
import { readPadDiagnostics } from "@/lib/face-pad-diagnostics";

export function useFacePad(owner: string | null, eligible: boolean, a: TemporaryPhoto | null, b: TemporaryPhoto | null) {
  const [metadata, setMetadata] = useState<Record<PadSlot, PadMetadata>>(() => ({ A: emptyPadMetadata(), B: emptyPadMetadata() }));
  const latest = useRef({ owner, eligible, a, b, metadata }); latest.current = { owner, eligible, a, b, metadata };
  const revoked = useRef(false), generation = useRef(0), flight = useRef<AbortController | null>(null), pending = useRef(false);
  const [availability, setAvailability] = useState<"loading" | "enabled" | "disabled" | "error">("loading"), [retry, setRetry] = useState(0);
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState<PadSlot | null>(null);
  const [attempts, setAttempts] = useState<Partial<Record<PadSlot, PadAttempt>>>({}), [rows, setRows] = useState<PadAttempt[]>([]);
  const recorded = useRef(new Set<string>()), bound = useRef(owner);
  const inputs = useRef<Partial<Record<PadSlot, { owner: string; photo: TemporaryPhoto; metadata: PadMetadata }>>>({});
  const activeSlot = useRef<PadSlot | null>(null);
  const photos = useRef({ A: a, B: b });
  const cancel = useCallback(() => { ++generation.current; flight.current?.abort(); flight.current = null; pending.current = false; activeSlot.current = null; setBusy(null); }, []);
  useEffect(() => {
    const next = { A: a, B: b };
    const changed = (["A", "B"] as const).filter(slot => photos.current[slot] !== next[slot]);
    photos.current = next;
    if (!changed.length) return;
    // Each PAD result belongs to one photo. Retaking the other photo must not
    // remove this result or cancel its already-consented request.
    if (activeSlot.current && changed.includes(activeSlot.current)) cancel();
    setConsent(false);
    for (const slot of changed) delete inputs.current[slot];
    setAttempts(previous => {
      const remaining = { ...previous };
      for (const slot of changed) delete remaining[slot];
      return remaining;
    });
  }, [a, b, cancel]);
  useEffect(() => {
    bound.current = owner; revoked.current = !eligible;
    const recordedAttempts = recorded.current;
    const reset = () => { cancel(); inputs.current = {}; recordedAttempts.clear(); setAttempts({}); setRows([]); setMetadata({ A: emptyPadMetadata(), B: emptyPadMetadata() }); setConsent(false); };
    reset();
    const invalidate = () => { revoked.current = true; latest.current.eligible = false; reset(); setAvailability("disabled"); };
    const offClear = onStoredAuthCleared(invalidate), offChange = onAuthSessionChanged(invalidate);
    window.addEventListener("pagehide", invalidate);
    return () => { revoked.current = true; cancel(); inputs.current = {}; recordedAttempts.clear(); offClear(); offChange(); window.removeEventListener("pagehide", invalidate); };
  }, [owner, eligible, cancel]);
  useEffect(() => {
    setAvailability("loading"); if (!owner || !eligible || revoked.current) { setAvailability("disabled"); return; }
    const abort = new AbortController(); let alive = true;
    void apiClient<{ enabled: boolean }>("/face-pad/capabilities", { signal: abort.signal }).then(v => { if (alive && !revoked.current) setAvailability(v.enabled ? "enabled" : "disabled"); }).catch(() => { if (alive && !revoked.current) setAvailability("error"); });
    return () => { alive = false; abort.abort(); };
  }, [owner, eligible, retry]);
  const update = useCallback((slot: PadSlot, key: keyof PadMetadata, value: string) => {
    if (revoked.current || !latest.current.eligible || bound.current !== latest.current.owner) return;
    if (activeSlot.current === slot) cancel();
    inputs.current[slot] = undefined; setAttempts(s => ({ ...s, [slot]: undefined }));
    const next = { ...latest.current.metadata, [slot]: { ...latest.current.metadata[slot], [key]: value } };
    if (key === "presentation" && value === "LIVE") next[slot].mediaId = "";
    latest.current.metadata = next; setMetadata(next);
  }, [cancel]);
  const inspect = useCallback(async (slot: PadSlot) => {
    const input = latest.current, photo = slot === "A" ? input.a : input.b, meta = input.metadata[slot];
    if (revoked.current || !input.owner || bound.current !== input.owner || !input.eligible || !photo || !consent || pending.current || availability !== "enabled" || !padMetadataValid(meta)) return;
    pending.current = true; activeSlot.current = slot; const own = ++generation.current, abort = new AbortController(), id = crypto.randomUUID(); flight.current = abort;
    const current = () => !revoked.current && own === generation.current && latest.current.eligible && latest.current.owner === input.owner
      && (slot === "A" ? latest.current.a : latest.current.b) === photo && latest.current.metadata[slot] === meta;
    setBusy(slot); inputs.current[slot] = undefined; setAttempts(s => ({ ...s, [slot]: undefined }));
    const timer = setTimeout(() => abort.abort(), 20000);
    let attempt: PadAttempt;
    try {
      if (!photo.blob.size || photo.blob.size > 4 * 1024 * 1024 || Math.min(photo.width, photo.height) < 128 || Math.max(photo.width, photo.height) > 4096 || photo.width * photo.height > 8000000) throw Error("FACE_INPUT_LIMIT");
      const form = new FormData(); form.append("photo", photo.blob, "capture.png"); form.append("slot", slot); form.append("requestId", id);
      const response = await authorizedFetch("/face-pad/inspect", { method: "POST", body: form, signal: abort.signal });
      const envelope = await response.json();
      if (abort.signal.aborted) throw Error("PAD_TIMEOUT");
      const result = response.ok ? readPadResult(envelope.data, id, slot) : null;
      if (response.ok && !result) throw Error("PAD_PROCESS_FAILED");
      const reason = padReasons.includes(envelope.errors?.code) ? envelope.errors.code as PadReason : "PAD_PROCESS_FAILED";
      const diagnostics = result?.diagnostics ?? readPadDiagnostics(envelope.errors?.diagnostics);
      if (diagnostics === undefined || !result && diagnostics !== null && (envelope.errors?.requestId !== id || envelope.errors?.slot !== slot)) throw Error("PAD_PROCESS_FAILED");
      attempt = { id, slot, completedAt: new Date().toISOString(), metadata: { ...meta }, status: result ? "SUCCESS" : "ERROR", result, reason: result ? null : reason,
        provenance: result?.provenance ?? readPadProvenance(envelope.errors?.provenance), diagnostics };
    } catch (error) {
      const reason = abort.signal.aborted ? "PAD_TIMEOUT" : error instanceof Error && padReasons.includes(error.message as PadReason) ? error.message as PadReason : "PAD_SERVICE_UNAVAILABLE";
      attempt = { id, slot, completedAt: new Date().toISOString(), metadata: { ...meta }, status: "ERROR", reason, result: null, provenance: null, diagnostics: null };
    } finally { clearTimeout(timer); if (own === generation.current) { pending.current = false; flight.current = null; activeSlot.current = null; setBusy(null); } }
    if (current()) { inputs.current[slot] = { owner: input.owner, photo, metadata: meta }; setAttempts(s => ({ ...s, [slot]: attempt })); }
  }, [availability, consent]);
  const visible = !revoked.current && eligible && owner !== null && bound.current === owner;
  const attemptFor = (slot: PadSlot) => {
    const v = inputs.current[slot]; return visible && v?.owner === owner && v.photo === (slot === "A" ? a : b) && v.metadata === metadata[slot] ? attempts[slot] ?? null : null;
  };
  const canRecord = (slot: PadSlot) => { const v = attemptFor(slot); return !!v && !recorded.current.has(v.id); };
  const record = (slot: PadSlot) => { const v = attemptFor(slot); if (!v || !canRecord(slot) || revoked.current || latest.current.owner !== owner || !latest.current.eligible) return; recorded.current.add(v.id); setRows(s => [...s, v]); };
  return { metadata: visible ? metadata : { A: emptyPadMetadata(), B: emptyPadMetadata() }, update, consent, setConsent, busy, availability, inspect, cancel,
    attemptFor, canRecord, record, rows: visible ? rows : [], remove: (id: string) => { if (visible) setRows(s => s.filter(r => r.id !== id)); }, retryAvailability: () => setRetry(n => n + 1) };
}
