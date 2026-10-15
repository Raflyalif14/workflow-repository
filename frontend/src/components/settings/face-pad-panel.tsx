"use client";
import { useLanguage } from "@/components/i18n/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TemporaryPhoto } from "@/lib/face-photo";
import { useFacePad } from "@/hooks/use-face-pad";
import { downloadPadCsv, padMetadataValid } from "@/lib/face-pad";
import { FacePadGeometry } from "./face-pad-geometry";
import { FacePadRoi } from "./face-pad-roi";

export function FacePadPanel({ owner, eligible, a, b }: { owner: string | null; eligible: boolean; a: TemporaryPhoto | null; b: TemporaryPhoto | null }) {
  const { t } = useLanguage(), pad = useFacePad(owner, eligible, a, b);
  return <Card className="min-w-0 max-w-3xl" data-pad-panel="true">
    <CardHeader><CardTitle className="text-base">{t("facePad.title")}</CardTitle></CardHeader>
    <CardContent className="min-w-0 space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">{t("facePad.disclosure")}</p>
      <p className="text-xs leading-5 text-muted-foreground">{t("facePad.disclaimer")}</p>
      <label className="flex items-start gap-2 text-sm leading-5">
        <input data-pad-consent="true" type="checkbox" checked={pad.consent} disabled={!eligible || !!pad.busy} onChange={e => pad.setConsent(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-blue-600" />
        {t("facePad.consent")}
      </label>
      {pad.availability !== "enabled" && <p role="status" className="text-sm text-muted-foreground">{t(`facePad.${pad.availability}`)}</p>}
      {["disabled", "error"].includes(pad.availability) && <Button variant="outline" onClick={pad.retryAvailability}>{t("common.retry")}</Button>}
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        {(["A", "B"] as const).map(slot => {
          const photo = slot === "A" ? a : b, meta = pad.metadata[slot], attempt = pad.attemptFor(slot);
          return <section key={slot} className="min-w-0 space-y-3 rounded-lg border p-3" data-pad-slot={slot}>
            <h3 className="font-semibold">{t(`faceCompare.photo${slot}`)}</h3>
            {(["participant", "session"] as const).map(key => <label key={key} htmlFor={`pad-${slot}-${key}`} className="block space-y-1 text-sm">
              <span>{t(`facePad.${key}`)}</span>
              <Input id={`pad-${slot}-${key}`} value={meta[key]} autoComplete="off" spellCheck={false} maxLength={24} disabled={!eligible} onChange={e => pad.update(slot, key, e.target.value)} />
            </label>)}
            <label className="block space-y-1 text-sm" htmlFor={`pad-${slot}-presentation`}>
              <span>{t("facePad.presentation")}</span>
              <select id={`pad-${slot}-presentation`} value={meta.presentation} disabled={!eligible} onChange={e => pad.update(slot, "presentation", e.target.value)} className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                <option value="">{t("faceNotes.choose")}</option>
                {(["LIVE", "SCREEN_PHOTO", "PRINT_PHOTO", "SCREEN_VIDEO"] as const).map(v => <option key={v} value={v}>{t(`faceNotes.${v}`)}</option>)}
              </select>
            </label>
            {meta.presentation !== "LIVE" && <label className="block space-y-1 text-sm" htmlFor={`pad-${slot}-mediaId`}>
              <span>{t("facePad.mediaId")}</span>
              <Input id={`pad-${slot}-mediaId`} value={meta.mediaId} maxLength={24} autoComplete="off" spellCheck={false} disabled={!eligible} onChange={e => pad.update(slot, "mediaId", e.target.value)} />
            </label>}
            <p className="text-xs leading-5 text-muted-foreground">{t("facePad.metadataHelp")}</p>
            {!photo && <p className="text-sm text-muted-foreground">{t("facePad.photoRequired")}</p>}
            <div className="flex flex-wrap gap-2">
              <Button data-pad-inspect={slot} onClick={() => void pad.inspect(slot)} disabled={!eligible || !photo || !pad.consent || !!pad.busy || pad.availability !== "enabled" || !padMetadataValid(meta)}>{t(pad.busy === slot ? "facePad.processing" : "facePad.check", { slot })}</Button>
              <Button variant="outline" onClick={() => pad.record(slot)} disabled={!eligible || !pad.canRecord(slot)}>{t("facePad.record")}</Button>
            </div>
            {attempt && <div data-pad-result={slot} role={attempt.status === "ERROR" ? "alert" : "status"} className="space-y-1 text-sm">
              <p className="font-medium">{t(`facePad.${attempt.status}`)}</p>
              {attempt.reason && <p className="text-destructive">{t(`facePad.${attempt.reason}`)}</p>}
              {attempt.result && <dl className="grid min-w-0 grid-cols-2 gap-2 [overflow-wrap:anywhere]">
                <div><dt>{t("facePad.real")}</dt><dd className="font-mono">{String(attempt.result.probabilities.real)}</dd></div>
                <div><dt>{t("facePad.spoof")}</dt><dd className="font-mono">{String(attempt.result.probabilities.spoof)}</dd></div>
              </dl>}
              {attempt.provenance && <p className="break-words text-xs text-muted-foreground">{attempt.provenance.model} · {attempt.provenance.cropVersion}</p>}
              <FacePadGeometry diagnostics={attempt.diagnostics} />
              <FacePadRoi owner={owner} eligible={eligible} slot={slot} photo={photo} attempt={attempt} />
            </div>}
          </section>;
        })}
      </div>
      {pad.busy && <Button variant="outline" onClick={pad.cancel}>{t("common.cancel")}</Button>}
      <section aria-label={t("facePad.notes")} className="min-w-0 space-y-3 border-t pt-4">
        <h3 className="font-semibold">{t("facePad.notes")}</h3>
        <p className="text-xs leading-5 text-muted-foreground">{t("facePad.notesHelp")}</p>
        <Button variant="outline" onClick={() => downloadPadCsv(pad.rows)} disabled={!eligible || !pad.rows.length}>{t("facePad.export")}</Button>
        {!pad.rows.length ? <p className="text-sm text-muted-foreground">{t("facePad.empty")}</p> : <div className="max-w-full overflow-x-auto rounded-lg border" tabIndex={0} role="region" aria-label={t("facePad.notes")}>
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50"><tr>{(["photo", "participant", "session", "presentation", "status", "real", "spoof"] as const).map(k => <th key={k} className="p-2 font-medium" scope="col">{t(`facePad.${k}`)}</th>)}<th scope="col" className="p-2">{t("facePad.geometryTitle")}</th><th scope="col" className="p-2">{t("faceNotes.remove")}</th></tr></thead>
            <tbody>{pad.rows.map(row => <tr key={row.id} className="border-t align-top" data-pad-row={row.id}>
              <td className="p-2">{row.slot}</td><td className="p-2">{row.metadata.participant}</td><td className="p-2">{row.metadata.session}</td>
              <td className="p-2">{t(`faceNotes.${row.metadata.presentation as "LIVE"}`)}<p className="text-xs">{row.metadata.mediaId}</p></td>
              <td className="p-2">{t(`facePad.${row.status}`)}{row.reason && <p className="text-xs">{t(`facePad.${row.reason}`)}</p>}</td>
              <td className="p-2 font-mono">{row.result ? String(row.result.probabilities.real) : "—"}</td><td className="p-2 font-mono">{row.result ? String(row.result.probabilities.spoof) : "—"}</td>
              <td className="min-w-[12rem] max-w-xs p-2"><FacePadGeometry diagnostics={row.diagnostics} /></td>
              <td className="p-2"><Button variant="outline" size="sm" aria-label={t("faceNotes.removeRow", { id: row.id })} onClick={() => pad.remove(row.id)}>{t("faceNotes.remove")}</Button></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
    </CardContent>
  </Card>;
}
