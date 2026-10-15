import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { csvCell, trialCsv, emptyTrialMetadata, trialMetadataError, validTrialAttempt, downloadTrialCsv, type TrialAttempt } from "./face-experiment-notes";
import { useFaceExperimentNotes } from "@/hooks/use-face-experiment-notes";
import { FaceExperimentMetadata, FaceExperimentRecords } from "@/components/settings/face-experiment-notes";
import * as language from "@/components/i18n/language-provider";
import { clearStoredAuth } from "./auth";
import { setActiveLanguage, translate } from "@/i18n";

const metadata = { ...emptyTrialMetadata(), participantA: "P01", participantB: "P01", sessionA: "S01", sessionB: "S02", truth: "SAME" as const, sourceA: "LIVE" as const, sourceB: "SCREEN_PHOTO" as const, condition: "NORMAL" as const };
const provenance = { modelVersion: "2021dec", modelSha256: "a".repeat(64), detectorVersion: "2023mar", detectorSha256: "b".repeat(64), preprocessingVersion: "opencv-sface-five-landmark-112-v1", runtimeVersion: "4.13.0", embeddingDimensions: 128 };
const success: TrialAttempt = { id: "00000000-0000-4000-8000-000000000001", completedAt: "2026-10-12T00:00:00.000Z", metadata, outcome: "SUCCESS", result: { model: "opencv-sface-2021dec", metric: "cosine", score: 0.6027477979660034, provenance }, provenance, reason: null };
const failed: TrialAttempt = { ...success, id: "00000000-0000-4000-8000-000000000002", outcome: "FAILED", result: null, reason: "FACE_NONE" };
assert.equal(trialMetadataError(emptyTrialMetadata()), "required");
assert.equal(trialMetadataError(metadata), null);
assert.equal(trialMetadataError({ ...metadata, participantB: "P02" }), "truthConflict");
assert.equal(trialMetadataError({ ...metadata, truth: "DIFFERENT" }), "truthConflict");
assert.equal(trialMetadataError({ ...metadata, participantB: "P02", truth: "DIFFERENT" }), null);
assert.equal(trialMetadataError({ ...metadata, participantA: "person@example.test" }), "codeInvalid");
assert.equal(trialMetadataError({ ...metadata, participantA: "=SUM(1)" }), "codeInvalid");
assert(validTrialAttempt(success)); assert(validTrialAttempt(failed));
assert(!validTrialAttempt({ ...success, result: { ...success.result!, score: NaN } }));
assert(!validTrialAttempt({ ...failed, result: success.result }));
assert.equal(csvCell('a,"b"\r\nc'), '"a,""b""\r\nc"');
for (const v of ["=1+1", "+SUM(1)", "-1", "@SUM(1)", "\t=1", " \r=1"]) assert(csvCell(v).startsWith('"\''), "Formula injection neutralized");
const csv = trialCsv([success, failed]);
assert(csv.includes('"0.6027477979660034"'), "Export preserves raw score");
const failureLine = csv.split("\r\n")[2]; assert(failureLine.includes('"FAILED","","FACE_NONE"'), "Failure exports empty score, never zero");
for (const forbidden of ["blob:", "embedding\":", "token", "email", "storage_path"]) assert(!csv.includes(forbidden));

let owner: string | null = "actor-one", eligible = true;
const events = Object.assign(new EventTarget(), { localStorage: { getItem: () => null, removeItem() {} } });
const originalWindow = globalThis.window, originalLanguage = language.useLanguage;
(globalThis as any).window = events;
const slots: any[] = [], cleanups: Array<(() => void) | undefined> = [];
function render() {
  let cursor = 0; const effects: Array<() => void> = [];
  const originals = { state: React.useState, ref: React.useRef, effect: React.useEffect, callback: React.useCallback };
  const equal = (x: any[], y: any[]) => x && x.length === y.length && x.every((v, i) => Object.is(v, y[i]));
  (React as any).useState = (initial: any) => { const slot = slots[cursor++] ??= { value: typeof initial === "function" ? initial() : initial }; return [slot.value, (v: any) => { slot.value = typeof v === "function" ? v(slot.value) : v; }]; };
  (React as any).useRef = (initial: any) => slots[cursor++] ??= { current: initial };
  (React as any).useCallback = (fn: any, deps: any[]) => { const i = cursor++; if (!equal(slots[i]?.deps, deps)) slots[i] = { value: fn, deps }; return slots[i].value; };
  (React as any).useEffect = (fn: any, deps: any[]) => { const i = cursor++; if (!equal(slots[i]?.deps, deps)) { slots[i] = { deps }; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); }); } };
  let value: ReturnType<typeof useFaceExperimentNotes>;
  try { value = useFaceExperimentNotes(owner, eligible); }
  finally { Object.assign(React, { useState: originals.state, useRef: originals.ref, useEffect: originals.effect, useCallback: originals.callback }); }
  effects.forEach(fn => fn()); return value!;
}
try {
  render(); let notes = render(); assert.equal(notes.rows.length, 0, "No historical sample scores seeded");
  for (const [key, value] of Object.entries(metadata)) notes.update(key as keyof typeof metadata, value);
  notes = render(); assert(notes.canRecord(success));
  notes.record(success); notes.record(success); notes = render(); assert.equal(notes.rows.length, 1, "Double click records once");
  assert(!notes.canRecord(success)); notes.record(failed); notes = render(); assert.equal(notes.rows.length, 2);
  setActiveLanguage("id"); assert.equal(render().rows.length, 2, "Language retains rows and metadata");
  notes.remove(success.id); notes = render(); assert.equal(notes.rows.length, 1); assert(!notes.canRecord(success), "Deleted result cannot be recorded twice");
  notes.update("sessionB", "S03"); notes.record({ ...success, id: "00000000-0000-4000-8000-000000000003" });
  assert.equal(render().rows.length, 1, "Synchronous metadata edit blocks stale recording");
  owner = "actor-two"; assert.equal(render().rows.length, 0, "Old account records hidden on first render"); notes = render(); assert.equal(notes.metadata.participantA, "");
  for (const [key, value] of Object.entries(metadata)) notes.update(key as keyof typeof metadata, value);
  notes = render(); notes.record(success); assert.equal(render().rows.length, 1);
  clearStoredAuth(); assert.equal(render().rows.length, 0); render().record(failed); assert.equal(render().rows.length, 0, "Logout latch blocks stale actor writes");
  owner = "actor-three"; render(); notes = render();
  for (const [key, value] of Object.entries(metadata)) notes.update(key as keyof typeof metadata, value);
  notes = render(); notes.record(success); events.dispatchEvent(new Event("pagehide")); assert.equal(render().rows.length, 0);

  (language as any).useLanguage = () => ({ t: translate });
  for (const locale of ["en", "id"] as const) {
    setActiveLanguage(locale);
    const synthetic = { ...notes, metadata, rows: [success, failed], canRecord: () => true };
    const form = renderToStaticMarkup(<FaceExperimentMetadata notes={synthetic} eligible />);
    const table = renderToStaticMarkup(<FaceExperimentRecords notes={synthetic} completed={success} eligible />);
    for (const key of ["title", "intro", "privacy", "truth", "sourceA", "sourceB", "condition", "record", "export", "FAILED"] as const) assert(!translate(`faceNotes.${key}`).startsWith("faceNotes."));
    assert(form.includes('id="trial-participantA"') && form.includes('id="trial-truth"'));
    assert(table.includes("0.6027477979660034") && table.includes(translate("faceNotes.FAILED")) && table.includes("overflow-x-auto"));
    const blocked = renderToStaticMarkup(<FaceExperimentRecords notes={{ ...synthetic, rows: [], canRecord: () => false }} completed={null} eligible />);
    assert(blocked.includes('disabled=""') && blocked.includes(translate("faceNotes.empty")));
  }
  const originalDocument = globalThis.document, originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  let clicks = 0, revoked = 0, exported: Blob | null = null;
  (globalThis as any).document = { createElement: () => ({ click() { clicks++; }, remove() {} }), body: { appendChild() {} } };
  URL.createObjectURL = blob => { exported = blob as Blob; return "blob:synthetic-export"; }; URL.revokeObjectURL = () => { revoked++; };
  try { downloadTrialCsv([success, failed]); assert.equal(clicks, 1); assert.equal(revoked, 1); assert((exported as Blob | null)?.type.includes("text/csv")); }
  finally { (globalThis as any).document = originalDocument; URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; }
  console.log("Face notes: metadata validation, success/failure, raw-score CSV/escaping/formula protection, double click, stale metadata, delete, EN/ID UI, export cleanup and account/logout/pagehide isolation passed (synthetic fixtures).");
} finally { cleanups.forEach(fn => fn?.()); (globalThis as any).window = originalWindow; (language as any).useLanguage = originalLanguage; setActiveLanguage("en"); }
