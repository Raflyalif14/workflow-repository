"use client";
import { useLanguage } from "@/components/i18n/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getIntlLocale } from "@/i18n";
import { downloadTrialCsv, trialMetadataError, type TrialAttempt, type TrialMetadata } from "@/lib/face-experiment-notes";
import type { useFaceExperimentNotes } from "@/hooks/use-face-experiment-notes";

type Props = { notes: ReturnType<typeof useFaceExperimentNotes>; completed: TrialAttempt | null; eligible: boolean };
const selectClass = "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50";
export function FaceExperimentMetadata({ notes, eligible }: Pick<Props, "notes" | "eligible">) {
  const { t } = useLanguage();
  const error = trialMetadataError(notes.metadata);
  const fields = ["participantA", "participantB", "sessionA", "sessionB"] as const;
  const options = { truth: ["SAME", "DIFFERENT"], sourceA: ["LIVE", "SCREEN_PHOTO", "PRINT_PHOTO", "SCREEN_VIDEO"], sourceB: ["LIVE", "SCREEN_PHOTO", "PRINT_PHOTO", "SCREEN_VIDEO"], condition: ["NORMAL", "EXPRESSION", "TURN", "LIGHT"] } as const;
  return <section aria-labelledby="face-notes-title" className="min-w-0 space-y-3 rounded-lg border p-3">
    <h2 id="face-notes-title" className="font-semibold">{t("faceNotes.title")}</h2>
    <p className="text-sm leading-6 text-muted-foreground">{t("faceNotes.intro")}</p>
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
      {fields.map(key => <label key={key} className="min-w-0 space-y-1 text-sm" htmlFor={`trial-${key}`}>
        <span>{t(`faceNotes.${key}`)}</span>
        <Input id={`trial-${key}`} value={notes.metadata[key]} maxLength={24} autoComplete="off" spellCheck={false}
          disabled={!eligible} onChange={e => notes.update(key, e.target.value)} aria-describedby="trial-metadata-help" />
      </label>)}
      {(Object.keys(options) as Array<keyof typeof options>).map(key => <label key={key} className="min-w-0 space-y-1 text-sm" htmlFor={`trial-${key}`}>
        <span>{t(`faceNotes.${key}`)}</span>
        <select id={`trial-${key}`} className={selectClass} value={notes.metadata[key]} disabled={!eligible}
          onChange={e => notes.update(key as keyof TrialMetadata, e.target.value)} aria-describedby="trial-metadata-help">
          <option value="">{t("faceNotes.choose")}</option>
          {options[key].map(value => <option key={value} value={value}>{t(`faceNotes.${value}`)}</option>)}
        </select>
      </label>)}
    </div>
    <p id="trial-metadata-help" role="status" className={`text-xs leading-5 ${error === "truthConflict" || error === "codeInvalid" ? "text-destructive" : "text-muted-foreground"}`}>{error ? t(`faceNotes.${error}`) : t("faceNotes.recordHint")}</p>
    <p className="text-xs leading-5 text-muted-foreground">{t("faceNotes.privacy")}</p>
  </section>;
}
export function FaceExperimentRecords({ notes, completed, eligible }: Props) {
  const { t } = useLanguage();
  const canRecord = notes.canRecord(completed);
  return <Card className="min-w-0 max-w-3xl" data-test-notes="true">
    <CardHeader><CardTitle className="text-base">{t("faceNotes.title")}</CardTitle></CardHeader>
    <CardContent className="min-w-0 space-y-3">
      <p className="text-sm leading-6 text-muted-foreground">{t("faceNotes.privacy")}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => notes.record(completed)} disabled={!eligible || !canRecord}>{t("faceNotes.record")}</Button>
        <Button variant="outline" onClick={() => downloadTrialCsv(notes.rows)} disabled={!eligible || !notes.rows.length}>{t("faceNotes.export")}</Button>
      </div>
      <p role="status" className="text-xs text-muted-foreground">{completed && !canRecord ? t("faceNotes.recorded") : t("faceNotes.recordHint")}</p>
      {!notes.rows.length ? <p className="text-sm text-muted-foreground">{t("faceNotes.empty")}</p> : <div className="max-w-full overflow-x-auto rounded-lg border" role="region" aria-label={t("faceNotes.title")} tabIndex={0}>
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50"><tr>{(["time", "participants", "label", "outcome", "score", "details", "remove"] as const).map(key => <th key={key} scope="col" className="p-3 font-medium">{t(`faceNotes.${key}`)}</th>)}</tr></thead>
          <tbody>{notes.rows.map(row => <tr key={row.id} className="border-t align-top" data-trial-row={row.id}>
            <td className="p-3">{new Intl.DateTimeFormat(getIntlLocale(), { dateStyle: "short", timeStyle: "medium" }).format(new Date(row.completedAt))}</td>
            <td className="p-3"><p>{row.metadata.participantA} / {row.metadata.sessionA}</p><p>{row.metadata.participantB} / {row.metadata.sessionB}</p></td>
            <td className="p-3"><p>{t(`faceNotes.${row.metadata.truth as "SAME"}`)}</p><p className="text-xs text-muted-foreground">{t(`faceNotes.${row.metadata.condition as "NORMAL"}`)}</p></td>
            <td className="p-3"><p>{t(`faceNotes.${row.outcome}`)}</p>{row.reason && <p className="text-xs text-muted-foreground">{t(`faceCompare.${row.reason}`)}</p>}</td>
            <td className="p-3 font-mono">{row.result ? String(row.result.score) : "—"}</td>
            <td className="p-3"><details className="min-w-[10rem] max-w-xs"><summary className="cursor-pointer text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{t("faceNotes.details")}</summary>
              <dl className="space-y-1 pt-2 text-xs [overflow-wrap:anywhere]">
                <dt>{t("faceNotes.attemptId")}</dt><dd>{row.id}</dd>
                <dt>{t("faceNotes.sourceA")}</dt><dd>{t(`faceNotes.${row.metadata.sourceA as "LIVE"}`)}</dd>
                <dt>{t("faceNotes.sourceB")}</dt><dd>{t(`faceNotes.${row.metadata.sourceB as "LIVE"}`)}</dd>
                {row.provenance ? <>
                  <dt>{t("faceNotes.model")}</dt><dd>opencv-sface / {row.provenance.modelVersion}</dd>
                  <dt>{t("faceNotes.checksum")}</dt><dd>{row.provenance.modelSha256}</dd>
                  <dt>{t("faceNotes.detector")}</dt><dd>YuNet / {row.provenance.detectorVersion}</dd>
                  <dt>{t("faceNotes.detectorChecksum")}</dt><dd>{row.provenance.detectorSha256}</dd>
                  <dt>{t("faceNotes.preprocessing")}</dt><dd>{row.provenance.preprocessingVersion}</dd>
                  <dt>{t("faceNotes.runtime")}</dt><dd>{row.provenance.runtimeVersion}</dd>
                  <dt>{t("faceNotes.dimensions")}</dt><dd>{row.provenance.embeddingDimensions}</dd>
                </> : <dd>{t("faceNotes.unknown")}</dd>}
              </dl>
            </details></td>
            <td className="p-3"><Button variant="outline" size="sm" aria-label={t("faceNotes.removeRow", { id: row.id })} onClick={() => notes.remove(row.id)}>{t("faceNotes.remove")}</Button></td>
          </tr>)}</tbody>
        </table>
      </div>}
      <p className="text-xs leading-5 text-muted-foreground">{t("faceNotes.csvHint")}</p>
    </CardContent>
  </Card>;
}
