import assert from "node:assert/strict";
import { apiClient, authorizedFetch, ApiError, SessionChangedError } from "./api-client";
import { AUTH_SESSION_KEY, clearStoredAuth, getAuthSession, onAuthSessionChanged, rotateAuthTokens, setAuthTokens } from "./auth";
import { loadVerifiedProfile, profileBlocksProtectedUi } from "./auth-profile";
import { DEFAULT_LANGUAGE, translate } from "../i18n";

const storage = new Map<string, string>();
const events = new EventTarget();
(globalThis as any).window = {
  localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
  addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events),
};
const originalFetch = globalThis.fetch;
const reply = (status: number, data?: unknown, code?: string) => new Response(JSON.stringify({ success: status === 200, message: "safe test response", data, errors: code ? { code } : null }), { status });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const expired = () => reply(401, undefined, "AUTH_TOKEN_INVALID");
const seed = () => { setAuthTokens({ accessToken: "old", refreshToken: "refresh-old" }); return getAuthSession()!; };
const auth = (options?: RequestInit) => new Headers(options?.headers).get("Authorization");
const tick = () => new Promise(resolve => setImmediate(resolve));

async function run() {
  // Same generation concurrent 401s + a late old-token 401 all share one rotation.
  seed();
  let refreshes = 0, writes = 0;
  const refresh = deferred<Response>();
  const late = deferred<Response>();
  let reachedRefresh = deferred<void>();
  globalThis.fetch = (async (url, options) => {
    if (String(url).endsWith("/auth/refresh")) { refreshes++; reachedRefresh.resolve(); return refresh.promise; }
    if (auth(options) === "Bearer old") return String(url).endsWith("/late") ? late.promise : expired();
    assert.equal(auth(options), "Bearer new"); writes++; return reply(200, { ok: true });
  }) as typeof fetch;
  const a = apiClient("/one"), b = apiClient("/two"), c = apiClient("/late");
  await reachedRefresh.promise;
  refresh.resolve(reply(200, { accessToken: "new", refreshToken: "refresh-new" }));
  await Promise.all([a,b]); late.resolve(expired()); await c;
  assert.equal(refreshes, 1); assert.equal(writes, 3);
  assert.equal(getAuthSession()?.refreshToken, "refresh-new");
  assert.equal(storage.get("workflow.refreshToken"), undefined);

  // The original multipart object is replayed, not reconstructed. Rejected
  // first requests run zero controllers; only the successful replay writes.
  seed(); refreshes = 0; writes = 0;
  const form = new FormData(); form.append("file", new File(["bytes"], "example.pdf"));
  form.append("expected_draft_revision", "8"); form.append("request_id", "receipt-1");
  form.append("replace_file_id", "file-1");
  const bodies: unknown[] = [];
  globalThis.fetch = (async (url, options) => {
    if (String(url).endsWith("/auth/refresh")) { refreshes++; return reply(200, { accessToken: "new" }); }
    assert.equal(options?.method, "POST"); bodies.push(options?.body);
    assert.equal(new Headers(options?.headers).has("Content-Type"), false);
    assert.equal((options?.body as FormData).get("request_id"), "receipt-1");
    assert.equal((options?.body as FormData).get("expected_draft_revision"), "8");
    if (auth(options) === "Bearer old") return expired();
    writes++; return reply(200, { receipt: "receipt-1", revision: 9 });
  }) as typeof fetch;
  await apiClient("/projects/p/output-documents/key/upload", { method: "POST", body: form });
  assert.deepEqual(bodies, [form, form]); assert.equal(writes, 1); assert.equal(refreshes, 1);
  assert.equal(getAuthSession()?.refreshToken, "refresh-old", "Omitted rotated refresh token retains the provider credential");

  seed(); let requests = 0; refreshes = 0;
  globalThis.fetch = (async url => { if (String(url).endsWith("/auth/refresh")) { refreshes++; return reply(200, { accessToken: "new" }); } requests++; return expired(); }) as typeof fetch;
  await assert.rejects(apiClient("/retry-401"), (error: unknown) => error instanceof ApiError && error.status === 401);
  assert.equal(requests, 2); assert.equal(refreshes, 1); assert.equal(getAuthSession(), null);

  for (const status of [403, 422, 429, 500, 503]) {
    seed(); requests = 0;
    globalThis.fetch = (async () => { requests++; return reply(status); }) as typeof fetch;
    await assert.rejects(apiClient("/business"), ApiError); assert.equal(requests, 1); assert(getAuthSession());
  }
  for (const path of ["login", "register", "forgot-password", "reset-password", "refresh", "logout"]) {
    seed(); requests = 0;
    globalThis.fetch = (async () => { requests++; return expired(); }) as typeof fetch;
    await assert.rejects(apiClient(`/auth/${path}`, { method: "POST" })); assert.equal(requests, 1); assert(getAuthSession());
  }
  seed(); requests = 0;
  globalThis.fetch = (async () => { requests++; throw new TypeError("offline"); }) as typeof fetch;
  await assert.rejects(apiClient("/business")); assert.equal(requests, 1); assert(getAuthSession());
  seed(); requests = 0;
  globalThis.fetch = (async () => { requests++; return reply(401, undefined, "UNRELATED_401"); }) as typeof fetch;
  await assert.rejects(apiClient("/business")); assert.equal(requests, 1); assert(getAuthSession());

  for (const failure of [401, 429, 503, "network"] as const) {
    seed(); requests = 0; refreshes = 0;
    globalThis.fetch = (async url => {
      if (!String(url).endsWith("/auth/refresh")) { requests++; return expired(); }
      refreshes++;
      if (failure === "network") throw new TypeError("offline");
      return reply(failure, undefined, failure === 401 ? "AUTH_REFRESH_INVALID" : "AUTH_UNAVAILABLE");
    }) as typeof fetch;
    await assert.rejects(apiClient("/business"));
    assert.equal(requests, 1); assert.equal(refreshes, 1);
    assert.equal(Boolean(getAuthSession()), failure !== 401);
    if (failure !== 401) {
      // A failed single-flight is removed, allowing an explicit fresh attempt.
      globalThis.fetch = (async url => String(url).endsWith("/auth/refresh") ? reply(200, { accessToken: "new" }) : requests++ === 1 ? expired() : reply(200, "recovered")) as typeof fetch;
      assert.equal(await apiClient("/business"), "recovered");
    }
  }

  // Logout/account replacement makes both old refresh success and error inert.
  for (const replacement of ["logout", "account"] as const) for (const status of [200, 401]) {
    seed(); const blocked = deferred<Response>(); reachedRefresh = deferred<void>(); writes = 0;
    globalThis.fetch = (async url => { if (String(url).endsWith("/auth/refresh")) { reachedRefresh.resolve(); return blocked.promise; } writes++; return expired(); }) as typeof fetch;
    const pending = apiClient("/business"); const rejected = assert.rejects(pending, SessionChangedError);
    await reachedRefresh.promise;
    if (replacement === "logout") clearStoredAuth(); else setAuthTokens({ accessToken: "other", refreshToken: "other-refresh" });
    blocked.resolve(reply(status, { accessToken: "new", refreshToken: "new-refresh" }, "AUTH_REFRESH_INVALID"));
    await rejected; assert.equal(writes, 1);
    assert.equal(getAuthSession()?.accessToken ?? null, replacement === "logout" ? null : "other");
  }
  // Distinct sessions never share a single-flight (old response can finish later).
  seed(); const old = deferred<Response>(); reachedRefresh = deferred<void>(); refreshes = 0;
  globalThis.fetch = (async (url, options) => {
    if (String(url).endsWith("/auth/refresh")) {
      refreshes++; if (JSON.parse(options?.body as string).refreshToken === "refresh-old") { reachedRefresh.resolve(); return old.promise; }
      return reply(200, { accessToken: "other-new", refreshToken: "other-rotated" });
    }
    return auth(options) === "Bearer other-new" ? reply(200, "other-success") : expired();
  }) as typeof fetch;
  const pendingOld = apiClient("/business"); const rejectedOld = assert.rejects(pendingOld, SessionChangedError);
  await reachedRefresh.promise; setAuthTokens({ accessToken: "other", refreshToken: "other-refresh" });
  assert.equal(await apiClient("/business"), "other-success");
  old.resolve(reply(200, { accessToken: "old-late" })); await rejectedOld;
  assert.equal(refreshes, 2); assert.equal(getAuthSession()?.accessToken, "other-new");

  // Profile state distinguishes unavailable/forbidden/stale from invalid.
  const session = seed();
  globalThis.fetch = (async () => reply(503)) as typeof fetch;
  assert.equal((await loadVerifiedProfile(session)).kind, "temporary"); assert(getAuthSession());
  assert.equal(profileBlocksProtectedUi(true, "temporary"), false);
  assert.equal(profileBlocksProtectedUi(false, "temporary"), true);
  assert.equal(profileBlocksProtectedUi(true, "forbidden"), true);
  globalThis.fetch = (async () => reply(200, { id: "user", role: "SA", is_active: true })) as typeof fetch;
  assert.equal((await loadVerifiedProfile(session)).kind, "verified");
  globalThis.fetch = (async () => reply(200, { id: "user", role: "SA" })) as typeof fetch;
  assert.equal((await loadVerifiedProfile(session)).kind, "temporary", "Incomplete successful responses cannot supply a verified UI identity");
  globalThis.fetch = (async () => reply(403)) as typeof fetch;
  assert.equal((await loadVerifiedProfile(session)).kind, "forbidden");
  globalThis.fetch = (async () => reply(200, { id: "user", is_active: false })) as typeof fetch;
  assert.equal((await loadVerifiedProfile(session)).kind, "invalid");
  globalThis.fetch = (async () => { throw new DOMException("Aborted", "AbortError"); }) as typeof fetch;
  assert.equal((await loadVerifiedProfile(session)).kind, "stale");
  const stale = deferred<Response>(); globalThis.fetch = (async () => stale.promise) as typeof fetch;
  const profile = loadVerifiedProfile(session); setAuthTokens({ accessToken: "other" });
  stale.resolve(reply(200, { id: "old-user", is_active: true })); assert.equal((await profile).kind, "stale");

  // Rotation does not signal account change; logout/login in another tab does.
  let changes = 0; const stop = onAuthSessionChanged(() => { changes++; });
  const snapshot = seed(), before = storage.get(AUTH_SESSION_KEY)!;
  rotateAuthTokens(snapshot, { accessToken: "new", refreshToken: "rotated" });
  const signal = () => { const event = new Event("storage"); Object.assign(event, { key: AUTH_SESSION_KEY, oldValue: before }); events.dispatchEvent(event); };
  signal(); assert.equal(changes, 0); setAuthTokens({ accessToken: "other" }); signal(); assert.equal(changes, 1);
  storage.clear(); const cleared = new Event("storage"); Object.assign(cleared, { key: null, oldValue: null }); events.dispatchEvent(cleared); assert.equal(changes, 2); stop();

  // An aborted consumer can share refresh but must not replay its mutation.
  seed(); const abort = new AbortController(); const waiting = deferred<Response>(); const started = deferred<void>(); requests = 0;
  globalThis.fetch = (async url => { if (String(url).endsWith("/auth/refresh")) { started.resolve(); return waiting.promise; } requests++; return expired(); }) as typeof fetch;
  const aborted = apiClient("/business", { signal: abort.signal });
  const abortRejected = assert.rejects(aborted, (error: unknown) => error instanceof Error && error.name === "AbortError");
  await started.promise; abort.abort(); waiting.resolve(reply(200, { accessToken: "new" })); await abortRejected; assert.equal(requests, 1);

  // A consumed stream is never retried; refresh only repairs the session.
  seed(); requests = 0;
  globalThis.fetch = (async url => String(url).endsWith("/auth/refresh") ? reply(200, { accessToken: "new" }) : (requests++, expired())) as typeof fetch;
  await assert.rejects(apiClient("/business", { method: "POST", body: new ReadableStream() }), (error: unknown) => error instanceof ApiError && error.code === "AUTH_REPLAY_REQUIRED");
  assert.equal(requests, 1); assert(getAuthSession());

  // Native cross-tab lock rechecks current storage before refreshing.
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const held = deferred<void>(); const lockStarted = deferred<void>(); const lockSession = seed(); refreshes = 0;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks: { request: async (_name: string, callback: () => Promise<unknown>) => { lockStarted.resolve(); await held.promise; return callback(); } } } });
  globalThis.fetch = (async (url, options) => { if (String(url).endsWith("/auth/refresh")) { refreshes++; return reply(500); } return auth(options) === "Bearer cross-tab" ? reply(200, "shared") : expired(); }) as typeof fetch;
  const tabRequest = apiClient("/business"); await lockStarted.promise;
  rotateAuthTokens(lockSession, { accessToken: "cross-tab", refreshToken: "cross-tab-refresh" }); held.resolve();
  assert.equal(await tabRequest, "shared"); assert.equal(refreshes, 0);
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator); else delete (globalThis as any).navigator;
  assert.equal(DEFAULT_LANGUAGE, "en");
  for (const language of ["en", "id"] as const) for (const key of ["sessionTemporary", "sessionForbidden", "retrySession", "signInAgain", "sessionChanged", "sessionExpired", "sessionRateLimited", "sessionInactive", "retryRequest"] as const) assert.notEqual(translate(`auth.${key}`, {}, language), `auth.${key}`);
  await tick();
  console.log("Auth session: rotation, single-flight, late 401, exclusions, errors, races, multipart receipt, profile guards and cross-tab locks passed.");
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { globalThis.fetch = originalFetch; clearStoredAuth(); });
