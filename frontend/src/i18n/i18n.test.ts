import assert from "node:assert/strict";
import { en } from "./en";
import { id } from "./id";
import { DEFAULT_LANGUAGE, formatDate, formatNumber, getLanguageCacheKey, resolveLanguagePreference, setActiveLanguage, translate, translateOutputName, translateProjectStatus, translateRole, translateStoredError, translateStoredMessage } from "./index";
import { SCENARIO_DOCUMENTS } from "../constants/scenarios";
import { formatActivityAction } from "../lib/activity-timeline";
import { resolveNextAction } from "../lib/workflow-ux-helpers";

const flattenKeys = (value: Record<string, Record<string, string>>) =>
  Object.entries(value).flatMap(([domain, entries]) => Object.keys(entries).map((entry) => `${domain}.${entry}`)).sort();

assert.deepEqual(flattenKeys(id), flattenKeys(en));
for (const [domain, entries] of Object.entries(en)) {
  for (const [key, english] of Object.entries(entries)) {
    const indonesian = (id as Record<string, Record<string, string>>)[domain][key];
    const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(placeholders(indonesian), placeholders(english), `${domain}.${key} placeholders`);
  }
}
assert.equal(DEFAULT_LANGUAGE, "en");
assert.equal(resolveLanguagePreference(null, null), "en");
assert.equal(resolveLanguagePreference("id", "en"), "id");
assert.equal(resolveLanguagePreference(null, "id"), "id");
assert.equal(getLanguageCacheKey("account-a"), "workflow-locale:account-a");
assert.notEqual(getLanguageCacheKey("account-a"), getLanguageCacheKey("account-b"));
assert.equal(translate("documents.version", { number: 3 }, "en"), "Version 3");
assert.equal(translate("documents.version", { number: 3 }, "id"), "Versi 3");
assert.equal(translateProjectStatus("WAITING_RESULT", "en"), "Waiting for result");
assert.equal(translateProjectStatus("WAITING_RESULT", "id"), "Menunggu hasil");
assert.equal(translateRole("HEAD_SA", "en"), "Head SA");
assert.equal(translateRole("HEAD_SA", "id"), "Head SA");
assert.notEqual(formatNumber(25000000, { style: "currency", currency: "IDR" }, "en"), formatNumber(25000000, { style: "currency", currency: "IDR" }, "id"));
assert.notEqual(formatDate("2026-09-30T00:00:00Z", { dateStyle: "long" }, "en"), formatDate("2026-09-30T00:00:00Z", { dateStyle: "long" }, "id"));
for (const document of Object.values(SCENARIO_DOCUMENTS).flat()) {
  assert.notEqual(translateOutputName(document.key, document.name, "en"), document.key);
  assert.notEqual(translateOutputName(document.key, document.name, "id"), document.key);
}
assert.equal(translateOutputName("custom_key", "Custom client name", "id"), "Custom client name");
setActiveLanguage("en");
const englishAction = formatActivityAction("PROJECT_CREATED");
const project = { id: "p1", name: "Client Alpha", status: "ACTIVE", sales_id: "sales1" } as any;
const milestone = { id: "m1", name: "Custom customer stage", status: "IN_PROGRESS", step_order: 1, pic_id: "sa1", start_date: "2026-01-01", workflow_stage: { default_role: "SA" } } as any;
const englishNext = resolveNextAction(project, [milestone], null, { id: "sa1", role: "SA" });
setActiveLanguage("id");
assert.notEqual(formatActivityAction("PROJECT_CREATED"), englishAction);
const indonesianNext = resolveNextAction(project, [milestone], null, { id: "sa1", role: "SA" });
assert.notEqual(indonesianNext.title, englishNext.title);
assert.ok(indonesianNext.title.includes("Custom customer stage"));
assert.equal(translateStoredMessage("auth.passwordChanged"), translate("auth.passwordChanged"));
assert.equal(translateStoredMessage("User-authored feedback"), "User-authored feedback");
assert.equal(translateStoredError("raw provider token abc"), translate("common.unexpectedError"));
setActiveLanguage(DEFAULT_LANGUAGE);

console.log("i18n dictionary tests passed.");
