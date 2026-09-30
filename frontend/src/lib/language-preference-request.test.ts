import assert from "node:assert/strict";
import type { AppLanguage } from "@/i18n";
import { isCurrentLanguagePreferenceRequest, loadLanguagePreference } from "./language-preference-request";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

async function run() {
  const first = deferred<AppLanguage>();
  let calls = 0;
  const requestA = loadLanguagePreference("account-a", "session-1", () => { calls++; return first.promise; });
  const duplicateA = loadLanguagePreference("account-a", "session-1", () => { calls++; return Promise.resolve("en"); });
  assert.strictEqual(duplicateA, requestA, "Concurrent reads for the same account and session share one promise");

  const second = deferred<AppLanguage>();
  const requestB = loadLanguagePreference("account-b", "session-2", () => { calls++; return second.promise; });
  assert.notStrictEqual(requestB, requestA, "A second account must have a separate request");
  await Promise.resolve();
  assert.equal(calls, 2);
  assert.equal(isCurrentLanguagePreferenceRequest("account-a", "account-b", 1, 1), false);
  first.resolve("id");
  second.resolve("en");
  assert.deepEqual(await Promise.all([requestA, duplicateA, requestB]), ["id", "id", "en"]);

  const oldSession = deferred<AppLanguage>();
  const pendingOldSession = loadLanguagePreference("account-a", "session-old", () => oldSession.promise);
  const newSession = deferred<AppLanguage>();
  const pendingNewSession = loadLanguagePreference("account-a", "session-new", () => newSession.promise);
  assert.notStrictEqual(pendingOldSession, pendingNewSession, "A new session must not reuse the old request");
  oldSession.resolve("id");
  newSession.resolve("en");
  await Promise.all([pendingOldSession, pendingNewSession]);

  const stale = deferred<AppLanguage>();
  let locale: AppLanguage = "en";
  let generation = 1;
  const pendingRead = loadLanguagePreference("account-choice", "session-choice", () => stale.promise);
  const readGeneration = generation;
  generation++;
  locale = "id";
  stale.resolve("en");
  const response = await pendingRead;
  if (isCurrentLanguagePreferenceRequest("account-choice", "account-choice", readGeneration, generation)) locale = response;
  assert.equal(locale, "id", "A late GET must not overwrite a newer language choice");

  const refreshed = await loadLanguagePreference("account-a", "session-1", () => { calls++; return Promise.resolve("en"); });
  assert.equal(refreshed, "en", "A settled read must allow a later refresh");
  assert.equal(calls, 3);
  console.log("Language preference request deduplication and stale response guards: passed");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
