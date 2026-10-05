import assert from "node:assert/strict";
import { translate } from "../i18n";
import { getOutputArchiveErrorKey } from "./output-archive-error";

for (const [message, key] of [
  ["Download all is limited to 100 MiB. Download files individually.", "outputUi.archiveTooLarge"],
  ["Archive file sizes cannot be verified. Download files individually.", "outputUi.archiveUnknownSize"],
  ["The complete archive is unavailable. Download files individually.", "outputUi.archiveUnavailable"],
] as const) {
  assert.equal(getOutputArchiveErrorKey(message), key);
  assert.notEqual(translate(key, {}, "en"), translate(key, {}, "id"));
  assert(translate(key, {}, "en").includes("individually"));
  assert(translate(key, {}, "id").includes("satu per satu"));
}
for (const unsafe of [undefined, null, { token: "private" }, "raw provider error", "outputUi.otherKey"]) {
  assert.equal(getOutputArchiveErrorKey(unsafe), "outputUi.archiveUnavailable");
}
console.log("Output archive EN/ID and safe fallback tests passed");
