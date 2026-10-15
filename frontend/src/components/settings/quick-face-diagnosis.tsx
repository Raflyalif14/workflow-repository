"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/i18n/language-provider";
import { authorizedFetch } from "@/lib/api-client";
import { onAuthSessionChanged, onStoredAuthCleared } from "@/lib/auth";
import type { TemporaryPhoto } from "@/lib/face-photo";
import { padReasons, type PadReason, type PadResult } from "@/lib/face-pad";
import { readCaptureAnalysis, type CaptureAnalysis } from "@/lib/face-pad-analysis";
import { getIntlLocale } from "@/i18n";

export function QuickFaceDiagnosis({ owner, eligible, photo, result }: {
  owner: string; eligible: boolean; photo: TemporaryPhoto; result: PadResult;
}) {
  const { t } = useLanguage();
  const latest = useRef({ owner, eligible, photo, result }); latest.current = { owner, eligible, photo, result };
  const revoked = useRef(false), generation = useRef(0), flight = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ owner: string; photo: TemporaryPhoto; result: PadResult; data: CaptureAnalysis | null; error: PadReason | null } | null>(null);
  useEffect(() => {
    revoked.current = !eligible; setSaved(null); setBusy(false);
    const cancel = () => { revoked.current = true; ++generation.current; flight.current?.abort(); flight.current = null; setBusy(false); setSaved(null); };
    const offClear = onStoredAuthCleared(cancel), offChange = onAuthSessionChanged(cancel);
    window.addEventListener("pagehide", cancel);
    return () => { cancel(); offClear(); offChange(); window.removeEventListener("pagehide", cancel); };
  }, [owner, eligible, photo, result]);
  const run = async () => {
    const input = latest.current;
    if (revoked.current || !input.eligible || flight.current) return;
    const own = ++generation.current, abort = new AbortController(); flight.current = abort; setBusy(true); setSaved(null);
    const current = () => own === generation.current && !revoked.current && latest.current.eligible && latest.current.owner === input.owner && latest.current.photo === input.photo && latest.current.result === input.result;
    const timer = setTimeout(() => abort.abort(), 20000);
    try {
      const bytes = new Uint8Array(await input.photo.blob.arrayBuffer());
      let hash: string;
      try { hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), n => n.toString(16).padStart(2, "0")).join(""); }
      finally { bytes.fill(0); }
      if (!current() || abort.signal.aborted) return;
      if (hash !== input.result.imageSha256) throw Error("PAD_PROCESS_FAILED");
      const requestId = crypto.randomUUID(), form = new FormData();
      form.append("photo", input.photo.blob, "capture.png"); form.append("slot", "A"); form.append("requestId", requestId);
      const response = await authorizedFetch("/face-pad/diagnose", { method: "POST", body: form, signal: abort.signal });
      const envelope = await response.json();
      if (!response.ok) throw Error(padReasons.includes(envelope?.errors?.code) ? envelope.errors.code : "PAD_PROCESS_FAILED");
      const data = readCaptureAnalysis(envelope.data);
      if (abort.signal.aborted) throw Error("PAD_TIMEOUT");
      if (!data || envelope.data.requestId !== requestId || envelope.data.slot !== "A" || data.imageSha256 !== hash || data.frame.width !== input.photo.width || data.frame.height !== input.photo.height) throw Error("PAD_PROCESS_FAILED");
      if (current()) setSaved({ ...input, data, error: null });
    } catch (error) {
      const reason = abort.signal.aborted ? "PAD_TIMEOUT" : error instanceof Error && padReasons.includes(error.message as PadReason) ? error.message as PadReason : "PAD_SERVICE_UNAVAILABLE";
      if (current()) setSaved({ ...input, data: null, error: reason });
    } finally { clearTimeout(timer); if (own === generation.current) { flight.current = null; setBusy(false); } }
  };
  const visible = eligible && !revoked.current && saved?.owner === owner && saved.photo === photo && saved.result === result ? saved : null;
  const data = visible?.data;
  const percent = (value: number) => new Intl.NumberFormat(getIntlLocale(), { style: "percent", minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(value);
  const reproduced = data && Math.abs(data.cropResults[0].opencv.real - result.probabilities.real) <= 1e-5 && Math.abs(data.cropResults[0].opencv.spoof - result.probabilities.spoof) <= 1e-5;
  return <section className="space-y-3 border-t pt-4" aria-label={t("faceQuick.analysisTitle")} data-capture-analysis="true">
    <h3 className="font-semibold">{t("faceQuick.analysisTitle")}</h3>
    <p className="text-xs leading-5 text-muted-foreground">{t("faceQuick.analysisPrivacy")}</p>
    <Button variant="outline" onClick={() => void run()} disabled={!eligible || busy}>{t(busy ? "faceQuick.analysing" : "faceQuick.analyse")}</Button>
    {visible?.error && <p role="alert" className="text-sm text-destructive">{t(`facePad.${visible.error}`)}</p>}
    {data && <div role="status" className="space-y-3 text-sm">
      <ul className="space-y-1">
        <li>{t(data.decoderMaxDifference === 0 ? "faceQuick.decoderMatch" : "faceQuick.decoderDifference")}</li>
        <li>{t(data.preprocessingMaxDifference <= 1e-6 ? "faceQuick.normalizationMatch" : "faceQuick.normalizationDifference")}</li>
        <li>{t(data.cropResults.every(row => row.runtimeMatches && row.deterministic) ? "faceQuick.runtimeMatch" : "faceQuick.runtimeDifference")}</li>
        <li>{t(reproduced ? "faceQuick.reproduced" : "faceQuick.notReproduced")}</li>
      </ul>
      <div className="overflow-x-auto"><table className="w-full text-left text-xs">
        <thead><tr><th className="p-2">{t("faceQuick.cropVariant")}</th><th className="p-2">{t("facePad.real")}</th><th className="p-2">{t("facePad.spoof")}</th></tr></thead>
        <tbody>{data.cropResults.map(row => <tr key={row.id} className="border-t"><td className="p-2">{t(`faceQuick.crop${row.id}`)}</td><td className="p-2 tabular-nums">{percent(row.opencv.real)}</td><td className="p-2 tabular-nums">{percent(row.opencv.spoof)}</td></tr>)}</tbody>
      </table></div>
      <p className="text-xs leading-5 text-muted-foreground">{t("faceQuick.analysisLimit")}</p>
      <details><summary className="cursor-pointer text-xs text-primary">{t("faceQuick.details")}</summary>
        <pre data-capture-analysis-json="true" className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 text-[11px]">{JSON.stringify(data, null, 2)}</pre>
      </details>
    </div>}
  </section>;
}
