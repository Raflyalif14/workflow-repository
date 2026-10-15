"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { onAuthSessionChanged, onStoredAuthCleared } from "@/lib/auth";
import type { TemporaryPhoto } from "@/lib/face-photo";
import { runQuickFaceTest, type QuickFaceOutcome } from "@/lib/quick-face-test";

export function useQuickFaceTest(owner: string | null, eligible: boolean, photo: TemporaryPhoto | null) {
  const latest = useRef({ owner, eligible, photo }); latest.current = { owner, eligible, photo };
  const bound = useRef(owner), revoked = useRef(false), generation = useRef(0);
  const flight = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false), [retry, setRetry] = useState(0);
  const [availability, setAvailability] = useState<"loading" | "enabled" | "disabled" | "error">("loading");
  const [saved, setSaved] = useState<{ owner: string; photo: TemporaryPhoto; outcome: QuickFaceOutcome } | null>(null);
  const cancel = useCallback(() => {
    ++generation.current; flight.current?.abort(); flight.current = null; setBusy(false); setSaved(null);
  }, []);
  useEffect(() => { cancel(); }, [photo, cancel]);
  useEffect(() => {
    bound.current = owner; revoked.current = !eligible; cancel();
    const invalidate = () => { revoked.current = true; cancel(); setAvailability("disabled"); };
    const offClear = onStoredAuthCleared(invalidate), offChange = onAuthSessionChanged(invalidate);
    window.addEventListener("pagehide", invalidate);
    return () => { revoked.current = true; cancel(); offClear(); offChange(); window.removeEventListener("pagehide", invalidate); };
  }, [owner, eligible, cancel]);
  useEffect(() => {
    if (!owner || !eligible || revoked.current) { setAvailability("disabled"); return; }
    let alive = true; const abort = new AbortController(); setAvailability("loading");
    void apiClient<{ enabled: boolean }>("/face-pad/capabilities", { signal: abort.signal })
      .then(value => { if (alive && !revoked.current) setAvailability(value.enabled ? "enabled" : "disabled"); })
      .catch(() => { if (alive && !revoked.current) setAvailability("error"); });
    return () => { alive = false; abort.abort(); };
  }, [owner, eligible, retry]);
  const run = useCallback(async () => {
    const input = latest.current;
    if (!input.owner || !input.eligible || !input.photo || bound.current !== input.owner || revoked.current || flight.current || availability !== "enabled") return;
    const own = ++generation.current, abort = new AbortController(); flight.current = abort; setBusy(true); setSaved(null);
    const timer = setTimeout(() => abort.abort(), 20000);
    try {
      const outcome = await runQuickFaceTest(input.photo, abort.signal);
      if (!revoked.current && own === generation.current && latest.current.owner === input.owner && latest.current.eligible && latest.current.photo === input.photo)
        setSaved({ owner: input.owner, photo: input.photo, outcome });
    } finally {
      clearTimeout(timer);
      if (own === generation.current) { flight.current = null; setBusy(false); }
    }
  }, [availability]);
  const visible = eligible && !revoked.current && owner !== null && owner === bound.current;
  return { availability, busy: visible && busy, run, cancel, retry: () => setRetry(n => n + 1),
    outcome: visible && saved?.owner === owner && saved.photo === photo ? saved.outcome : null };
}
