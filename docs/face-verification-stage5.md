# Stage 5: temporary experiment notes

Baseline inspected: `feat/face-verification / 58bc3d7`, staging empty, Stage 1–4
changes retained. No applicable AGENTS.md was found at the repository/parent or
layer roots. No dependency, migration, database or Storage change is required.

## Flow

1. Capture A/B with the existing single-camera, fresh-frame detector flow.
2. Enter anonymous participant and capture-session codes. Codes allow 1–24
   letters/digits/underscore/hyphen; names and email addresses must not be used.
3. Supply the actual same/different-person label, each photo source and condition.
   Same-person requires equal participant codes (case-insensitive); different
   people requires different codes. This label is never inferred from the score.
4. Consent and Compare. Every attempt has a new browser-generated UUID. The
   completion timestamp uses the browser clock in ISO UTC, not a claimed server
   audit timestamp. Metadata is held locally and bound to this request's exact
   photo objects and metadata revision; it is not sent to Python.
5. Explicitly choose Record result. Success retains the full numeric score;
   failure retains a whitelisted reason and null score. Cancelled, replaced,
   logged-out or superseded attempts cannot be recorded as completed attempts.
6. Delete a row or export CSV. The same completed attempt cannot be recorded
   twice, including after deleting its row. A new Compare is a new attempt.

Changing a photo or any metadata cancels/invalidates the previous completed
attempt immediately and ignores its late response, even if values are later
restored. Existing recorded rows remain immutable snapshots of their metadata.
Locale changes retain inputs and records; account change, logout, pagehide,
unmount and refresh discard this page's in-memory records. No localStorage,
database, file upload or permanent dataset is used for notes.

## Model provenance

Python returns model version, SHA-256 of the verified SFace and YuNet assets,
preprocessing version `opencv-sface-five-landmark-112-v1`, actual OpenCV runtime
version and embedding dimension 128. The checksum comes from the manifest used
by `verify_models`, which checks the actual installed bytes before inference.
Node and the frontend project only validated, bounded metadata fields. No raw
embedding, photo, internal key or sensitive path is returned or recorded.

Python failures can include provenance of the verified service configuration.
This does **not** claim that a failed attempt produced embeddings. If failure
occurs before Python responds (network, parsing, service unavailable), provenance
is null/blank; the UI explains it is unavailable. No frontend fallback invents
the model used. Successful responses missing valid provenance are rejected safely.

Restart the user's **own** Python service and backend after this code update:
an older running Python process will not return the new provenance fields.
Use the Stage 4 startup procedure with the same random internal key in both
process environments. Do not reinstall dependencies or download models again.
Do not stop unrecognized existing processes. Production remains default-disabled.

## CSV

CSV uses stable enum codes and UTC timestamps, correctly quotes commas/newlines/
double quotes and prefixes spreadsheet formula markers with an apostrophe even
after leading whitespace/control characters. It exports the original numeric
score string rather than the rounded main-screen presentation. Failed scores are
empty, never zero. UTF-8 BOM supports spreadsheet readers. Export happens only
on an explicit click; the temporary download URL is revoked. The columns include
anonymous codes, labels, source/condition, outcome, safe reason, UUID, timestamp
and provenance. No photos, vectors, token, name/email or sensitive path is included.

No previous three fixture scores are seeded into the records. This feature does
not add thresholds, identity decisions, enrollment, liveness or biometric login.

## Targeted validation

- PASS: `face-comparison.test.ts`: consent/request latch, exact photo/metadata
  binding, late metadata response refusal, success/failure, unavailable provenance,
  locale retention and account/logout isolation (mock transport).
- PASS: `face-experiment-notes.test.tsx`: validation, success/failure recording,
  double click, stale metadata, row deletion, account/logout/pagehide clearing,
  full-precision CSV, escaping/formula protection and export URL cleanup; actual
  React metadata/record components rendered with synthetic EN/ID data.
- PASS: affected `camera-preview.test.tsx` and central i18n dictionary test.
- PASS: `face-experiment-provenance.test.ts`: actual Node HTTP route and real
  Python SFace inference on public fixture photos; installed model checksums,
  runtime/preprocessing contract, safe success fields and failed-image metadata.
  The harness owns random loopback servers with synthetic authentication and
  closed them after testing. User processes and live providers were untouched.
- PASS: backend/frontend `tsc --noEmit`, Python AST syntax, strict UTF-8 for the
  Stage 5 files and `git diff --check` (including explicit untracked text checks).
- Existing Stage 4 HTTP/model-test assertions were extended for provenance,
  preserving their original checks. The browser harness now fills required
  synthetic metadata so it remains usable. Those larger suites/browser matrix
  were not rerun; their prior evidence is Stage 4 evidence, not Stage 5 visual QA.

Limits: Stage 5 UI tests are synthetic component/hook tests, not a new Chrome
visual run. Real-model HTTP evidence does not prove physical-camera capture,
real GoTrue integration, recognition accuracy or liveness. Stage 4/5 physical
comparison has not been confirmed by the user in this session. No private user
trial data or photos were written into Git or evidence screenshots.

## Files for study

- `frontend/src/lib/face-experiment-notes.ts`: metadata validation, result schema,
  provenance validation, CSV escaping/export.
- `frontend/src/hooks/use-face-experiment-notes.ts`: page-memory ledger, duplicate
  guard and session cleanup.
- `frontend/src/hooks/use-face-comparison.ts`: exact request/input binding and
  safe success/failure completion.
- `frontend/src/components/settings/face-experiment-notes.tsx`: form/table;
  `camera-preparation.tsx`: integration with existing camera slots.
- `services/face-experiment/inference.py`, `server.py`: actual model provenance;
  `backend/src/routes/face-experiment.routes.ts`: safe projection.
- EN/ID dictionaries, frontend explicit runner, focused tests and this report.

No stage/commit/push, installation/download, SQL, database/live mutation or
user-process termination was performed. Stages 1–5 remain in the worktree.
