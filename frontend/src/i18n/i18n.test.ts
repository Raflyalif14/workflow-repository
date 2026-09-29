import assert from "node:assert/strict";
import { en } from "./en";
import { id } from "./id";
import { DEFAULT_LANGUAGE, formatNumber, translate, translateProjectStatus, translateRole } from "./index";

const flattenKeys = (value: Record<string, Record<string, string>>) =>
  Object.entries(value).flatMap(([domain, entries]) => Object.keys(entries).map((entry) => `${domain}.${entry}`)).sort();

assert.deepEqual(flattenKeys(id), flattenKeys(en));
assert.equal(DEFAULT_LANGUAGE, "en");
assert.equal(translate("documents.version", { number: 3 }, "en"), "Version 3");
assert.equal(translate("documents.version", { number: 3 }, "id"), "Versi 3");
assert.equal(translateProjectStatus("WAITING_RESULT", "en"), "Waiting for result");
assert.equal(translateProjectStatus("WAITING_RESULT", "id"), "Menunggu hasil");
assert.equal(translateRole("HEAD_SA", "en"), "Head SA");
assert.equal(translateRole("HEAD_SA", "id"), "Head SA");
assert.notEqual(formatNumber(25000000, { style: "currency", currency: "IDR" }, "en"), formatNumber(25000000, { style: "currency", currency: "IDR" }, "id"));

console.log("i18n dictionary tests passed.");
