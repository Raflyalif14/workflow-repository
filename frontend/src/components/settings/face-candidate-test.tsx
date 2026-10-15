"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/i18n/language-provider";
import { apiClient, authorizedFetch } from "@/lib/api-client";
import { onAuthSessionChanged, onStoredAuthCleared } from "@/lib/auth";
import { getIntlLocale } from "@/i18n";
import { padReasons, type PadReason, type PadResult } from "@/lib/face-pad";
import type { TemporaryPhoto } from "@/lib/face-photo";
import { readCandidateResult, type CandidateResult } from "@/lib/face-pad-candidate";

export function FaceCandidateTest({ owner, eligible, photo, result }: {
  owner: string; eligible: boolean; photo: TemporaryPhoto; result: PadResult;
}) {
  const { t } = useLanguage();
  const latest = useRef({ owner, eligible, photo, result }); latest.current = { owner, eligible, photo, result };
  const revoked = useRef(false), generation = useRef(0), flight = useRef<AbortController | null>(null);
  const [enabled, setEnabled] = useState(false), [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ owner: string; photo: TemporaryPhoto; result: PadResult; data?: CandidateResult; error?: PadReason } | null>(null);
  useEffect(() => {
    revoked.current = !eligible; setSaved(null); setBusy(false); setEnabled(false);
    const capability = new AbortController();
    const cancel = () => { revoked.current = true; ++generation.current; flight.current?.abort(); flight.current = null; capability.abort(); setBusy(false); setSaved(null); setEnabled(false); };
    if (eligible) void apiClient<{ candidateEnabled?: boolean }>("/face-pad/capabilities", { signal: capability.signal })
      .then(v => { if (!capability.signal.aborted && !revoked.current) setEnabled(v.candidateEnabled === true); }).catch(() => {});
    const offClear = onStoredAuthCleared(cancel), offChange = onAuthSessionChanged(cancel);
    window.addEventListener("pagehide", cancel);
    return () => { cancel(); offClear(); offChange(); window.removeEventListener("pagehide", cancel); };
  }, [owner, eligible, photo, result]);
  const run = async () => {
    const input = latest.current;
    if (revoked.current || !input.eligible || !enabled || flight.current) return;
    const own = ++generation.current, abort = new AbortController(); flight.current = abort; setBusy(true); setSaved(null);
    const current = () => own === generation.current && !revoked.current && latest.current.eligible && latest.current.owner === input.owner && latest.current.photo === input.photo && latest.current.result === input.result;
    const timer = setTimeout(() => abort.abort(), 20000);
    try {
      const bytes = new Uint8Array(await input.photo.blob.arrayBuffer()); let hash: string;
      try { hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), n => n.toString(16).padStart(2, "0")).join(""); }
      finally { bytes.fill(0); }
      if (!current()) return;
      if (abort.signal.aborted) throw Error("PAD_TIMEOUT");
      if (hash !== input.result.imageSha256) throw Error("PAD_PROCESS_FAILED");
      const requestId = crypto.randomUUID(), form = new FormData();
      form.append("photo", input.photo.blob, "capture.png"); form.append("slot", "A"); form.append("requestId", requestId);
      const response = await authorizedFetch("/face-pad/candidate", { method: "POST", body: form, signal: abort.signal });
      const envelope = await response.json();
      if (!response.ok) throw Error(padReasons.includes(envelope?.errors?.code) ? envelope.errors.code : "PAD_PROCESS_FAILED");
      const data = readCandidateResult(envelope?.data);
      if (abort.signal.aborted) throw Error("PAD_TIMEOUT");
      if (!data || envelope.data.requestId !== requestId || envelope.data.slot !== "A" || data.imageSha256 !== hash
        || data.frame.width !== input.photo.width || data.frame.height !== input.photo.height
        || Math.abs(data.baseline.real-input.result.probabilities.real) > 1e-5 || Math.abs(data.baseline.spoof-input.result.probabilities.spoof) > 1e-5) throw Error("PAD_PROCESS_FAILED");
      if (current()) setSaved({ ...input, data });
    } catch (error) {
      const reason = abort.signal.aborted ? "PAD_TIMEOUT" : error instanceof Error && padReasons.includes(error.message as PadReason) ? error.message as PadReason : "PAD_SERVICE_UNAVAILABLE";
      if (current()) setSaved({ ...input, error: reason });
    } finally { clearTimeout(timer); if (own === generation.current) { flight.current = null; setBusy(false); } }
  };
  const visible = eligible && !revoked.current && saved?.owner === owner && saved.photo === photo && saved.result === result ? saved : null;
  if (!enabled || !eligible || revoked.current) return null;
  const data = visible?.data;
  const percent = (n: number) => new Intl.NumberFormat(getIntlLocale(), { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  return <section className="space-y-3 rounded-lg border border-primary/30 p-4" aria-label={t("faceCandidate.title")}>
    <h3 className="font-semibold">{t("faceCandidate.title")}</h3>
    <p className="text-sm leading-6 text-muted-foreground">{t("faceCandidate.description")}</p>
    <Button onClick={() => void run()} disabled={busy}>{t(busy ? "faceCandidate.busy" : "faceCandidate.run")}</Button>
    {visible?.error && <p role="alert" className="text-sm text-destructive">{t(`facePad.${visible.error}`)}</p>}
    {data && <div role="status" className="space-y-3">
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr><th className="p-2">{t("faceCandidate.model")}</th><th className="p-2">{t("faceCandidate.real")}</th><th className="p-2">{t("faceCandidate.spoof")}</th></tr></thead>
        <tbody><tr><td className="p-2">{t("faceCandidate.previous")}</td><td className="p-2">{percent(data.baseline.real)}</td><td className="p-2">{percent(data.baseline.spoof)}</td></tr>
          <tr className="border-t font-semibold"><td className="p-2">{t("faceCandidate.candidate")}</td><td className="p-2">{percent(data.candidate.probabilities.real)}</td><td className="p-2">{percent(data.candidate.probabilities.spoof)}</td></tr></tbody>
      </table></div>
      <p className="text-sm">{t("faceCandidate.next")}</p>
      <details><summary className="cursor-pointer text-xs text-primary">{t("faceQuick.details")}</summary>
        <pre data-candidate-result="true" className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 text-[11px]">{JSON.stringify(data, null, 2)}</pre>
      </details>
    </div>}
    <p className="text-xs leading-5 text-muted-foreground">{t("faceCandidate.limit")}</p>
  </section>;
}
