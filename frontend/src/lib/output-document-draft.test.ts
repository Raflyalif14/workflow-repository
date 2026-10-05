import assert from "node:assert/strict";
import { setActiveLanguage, translate } from "../i18n";
import { en } from "../i18n/en";
import { id } from "../i18n/id";
import {
  hasUnfinishedDraftUploads,
  getOutputDraftSubmitRequest,
  getOutputDraftReloadRevision,
  MAX_OUTPUT_DRAFT_BYTES,
  uploadOutputDraftQueue,
  validateOutputDraftSelection,
  type DraftUploadItem,
} from "./output-document-draft";
import { getOutputDocumentSubmitAction } from "./output-document-ux";

const fakeFile = (name: string, size = 100) => ({ name, size } as File);
const persisted = [{ id: "existing", fileName: "same.pdf", fileSize: 100 }];
assert.deepEqual(Object.keys(en.outputFiles).sort(), Object.keys(id.outputFiles).sort());
for (const key of Object.keys(en.outputFiles) as (keyof typeof en.outputFiles)[]) {
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  assert.deepEqual(placeholders(en.outputFiles[key]), placeholders(id.outputFiles[key]), `outputFiles.${key} placeholders`);
}
assert.equal(validateOutputDraftSelection(persisted, [fakeFile("same.pdf"), fakeFile("other.xlsx")]), null,
  "Same names are additions, without inferring a replacement target.");
assert.equal(validateOutputDraftSelection(persisted, [fakeFile("replacement.pdf")], "existing"), null);
assert.equal(validateOutputDraftSelection(persisted, [fakeFile("replacement.pdf")], "missing"), "outputFiles.replacementUnavailable");
assert.equal(validateOutputDraftSelection(persisted, [fakeFile("a.pdf"), fakeFile("b.pdf")], "existing"), "outputFiles.replacementUnavailable");
assert.equal(validateOutputDraftSelection(persisted, Array.from({ length: 10 }, () => fakeFile("ok.pdf"))), "outputFiles.fileCountLimit");
assert.equal(validateOutputDraftSelection([], [fakeFile("too-big.pdf", 51 * 1024 * 1024)]), "outputFiles.fileSizeLimit");
assert.equal(validateOutputDraftSelection([], [fakeFile("empty.pdf", 0)]), "outputFiles.fileSizeLimit");
assert.equal(validateOutputDraftSelection([], [fakeFile("bad.exe")]), "outputFiles.unsupportedType");
assert.equal(validateOutputDraftSelection([{ ...persisted[0], fileSize: MAX_OUTPUT_DRAFT_BYTES }], [fakeFile("new.pdf")]), "outputFiles.totalSizeLimit");
assert.equal(validateOutputDraftSelection([{ ...persisted[0], fileSize: MAX_OUTPUT_DRAFT_BYTES }], [fakeFile("new.pdf")], "existing"), null,
  "Replacing subtracts the exact target's old bytes from total size.");

async function main() {
  const submitRequests = new Map<string, { revision: number; requestId: string }>();
  let requestSequence = 0;
  const requestId = () => `submit-${++requestSequence}`;
  const firstSubmit = getOutputDraftSubmitRequest("output-one", 5, submitRequests, requestId);
  assert.deepEqual(getOutputDraftSubmitRequest("output-one", 5, submitRequests, requestId), firstSubmit,
    "Repeated submission of one draft must retain its idempotency key.");
  assert.notEqual(getOutputDraftSubmitRequest("output-one", 6, submitRequests, requestId).request_id, firstSubmit.request_id,
    "A later editable draft receives a separate submission identity.");
  assert.notEqual(getOutputDraftSubmitRequest("output-two", 5, submitRequests, requestId).request_id, firstSubmit.request_id,
    "A different output cannot reuse another output's submission identity.");
  let items: DraftUploadItem[] = ["one.pdf", "two.xlsx", "three.docx"].map((name, index) => ({ id: `request-${index}`, file: fakeFile(name), status: "pending" }));
  const calls: string[] = [];
  let active = 0;
  let peak = 0;
  let failSecond = true;
  const upload = async (item: DraftUploadItem, revision: number) => {
    active++;
    peak = Math.max(peak, active);
    calls.push(`${item.id}:${revision}:${item.replaceFileId || "add"}`);
    await Promise.resolve();
    active--;
    if (item.id === "request-1" && failSecond) throw new Error("Transport failure");
    return { draftRevision: revision + 1 };
  };
  const update = (id: string, patch: Pick<DraftUploadItem, "status" | "error">) => {
    items = items.map((item) => item.id === id ? { ...item, ...patch } : item);
  };
  const revision = await uploadOutputDraftQueue(items, 10, upload, update);
  assert.equal(peak, 1, "Draft CAS writes must be serial, without competing revisions.");
  assert.equal(revision, 11);
  assert.equal(items.map((item) => item.status).join(","), "succeeded,failed,pending");
  assert.equal(hasUnfinishedDraftUploads(items), true, "A failed file must block submission until retried or discarded.");
  const english = translate("outputFiles.retryFailed", undefined, "en");
  setActiveLanguage("id");
  assert.notEqual(translate("outputFiles.retryFailed"), english);
  assert.equal(items[1].file.name, "two.xlsx", "Locale changes do not transform queued File objects or identity.");
  failSecond = false;
  const afterRetry = await uploadOutputDraftQueue(items, revision, upload, update);
  assert.equal(afterRetry, 13);
  assert.deepEqual(calls, ["request-0:10:add", "request-1:11:add", "request-1:11:add", "request-2:12:add"],
    "Retry uses the failed file's same idempotency key and never reuploads success.");
  assert.equal(hasUnfinishedDraftUploads(items), false);

  let lostResponseItems: DraftUploadItem[] = ["first.pdf", "next.pdf"].map((name, index) => ({ id: `lost-${index}`, file: fakeFile(name), status: "pending" }));
  const receipts = new Map<string, { expectedRevision: number; draftRevision: number }>();
  let databaseRevision = 20;
  let firstResponseLost = true;
  const replayUpload = async (item: DraftUploadItem, expectedRevision: number) => {
    const previous = receipts.get(item.id);
    if (previous) {
      assert.equal(expectedRevision, previous.expectedRevision, "A lost response must retry the same request ID and original CAS token.");
      return previous;
    }
    assert.equal(expectedRevision, databaseRevision);
    const receipt = { expectedRevision, draftRevision: ++databaseRevision };
    receipts.set(item.id, receipt);
    if (firstResponseLost) { firstResponseLost = false; throw new Error("Response lost after metadata commit"); }
    return receipt;
  };
  const updateLost = (requestId: string, patch: Pick<DraftUploadItem, "status" | "error">) => {
    lostResponseItems = lostResponseItems.map((item) => item.id === requestId ? { ...item, ...patch } : item);
  };
  const beforeReplay = await uploadOutputDraftQueue(lostResponseItems, 20, replayUpload, updateLost);
  assert.equal(beforeReplay, 20);
  assert.equal(receipts.size, 1, "Pending files wait until an ambiguous write has been acknowledged.");
  await assert.rejects(async () => { throw new Error("Draft refresh unavailable"); });
  const reloadRevision = getOutputDraftReloadRevision(databaseRevision, beforeReplay, lostResponseItems);
  assert.equal(reloadRevision, 20, "Reload after a failed refresh must preserve an ambiguous upload's original CAS token.");
  const afterReplay = await uploadOutputDraftQueue(lostResponseItems, reloadRevision, replayUpload, updateLost);
  assert.equal(afterReplay, 22);
  assert.equal(receipts.size, 2, "Replaying a lost response does not create a duplicate file.");

  let conflictItems: DraftUploadItem[] = ["stale.pdf", "later.pdf"].map((name, index) => ({ id: `${index}`, file: fakeFile(name), status: "pending" }));
  let conflictCalls = 0;
  const conflictingRevision = await uploadOutputDraftQueue(conflictItems, 1, async () => {
    conflictCalls++;
    throw new Error("This output draft changed. Refresh and try again.");
  }, (id, patch) => { conflictItems = conflictItems.map((item) => item.id === id ? { ...item, ...patch } : item); });
  assert.equal(conflictingRevision, 1);
  assert.equal(conflictCalls, 1, "Stale CAS must stop the remaining queue without overwriting the newer draft.");
  assert.equal(conflictItems[0].error, "outputFiles.draftConflict");
  assert.equal(conflictItems[1].status, "pending");
  assert.equal(getOutputDraftReloadRevision(8, 1, conflictItems), 8,
    "A proven stale write can use the explicitly reloaded draft revision with a new request ID.");
  assert.equal(getOutputDraftReloadRevision(8, 1, items), 8,
    "Successful uploads do not pin an obsolete CAS token during refresh.");

  const draft = { status: "DRAFT", draftRevision: 3, draftFiles: persisted, canUpload: true, role: "SA" };
  assert.ok(getOutputDocumentSubmitAction(draft), "First submission does not require an existing review version.");
  assert.ok(getOutputDocumentSubmitAction({ ...draft, status: "REVISION_REQUIRED" }));
  assert.equal(getOutputDocumentSubmitAction({ ...draft, status: "IN_REVIEW" }), null);
  assert.equal(getOutputDocumentSubmitAction({ ...draft, draftFiles: [] }), null);
  assert.equal(getOutputDocumentSubmitAction({ ...draft, draftRevision: undefined }), null);
  for (const role of ["HEAD_SA", "SALES", "SUPER_ADMIN"]) assert.equal(getOutputDocumentSubmitAction({ ...draft, role }), null);
  for (const locale of ["en", "id"] as const) {
    assert.ok(translate("outputFiles.uploadFiles", undefined, locale));
    assert.ok(translate("outputFiles.draftHelp", undefined, locale));
    assert.ok(translate("outputFiles.legacyUnconfirmed", undefined, locale));
    assert.ok(!translate("outputFiles.replaceFile", { name: "client.pdf" }, locale).includes("{name}"));
  }
  setActiveLanguage("en");
  console.log("Output draft files: passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
