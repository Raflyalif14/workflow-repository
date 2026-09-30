import type { AppLanguage } from "@/i18n";

type PendingRequest = { sessionToken: string | null; promise: Promise<AppLanguage> };
const pendingByAccount = new Map<string, PendingRequest>();

export function loadLanguagePreference(
  accountId: string,
  sessionToken: string | null,
  fetchPreference: () => Promise<AppLanguage>
): Promise<AppLanguage> {
  const pending = pendingByAccount.get(accountId);
  if (pending?.sessionToken === sessionToken) return pending.promise;

  const promise = Promise.resolve().then(fetchPreference);
  const request = { sessionToken, promise };
  pendingByAccount.set(accountId, request);
  const clear = () => {
    if (pendingByAccount.get(accountId) === request) pendingByAccount.delete(accountId);
  };
  void promise.then(clear, clear);
  return promise;
}

export function isCurrentLanguagePreferenceRequest(
  accountId: string,
  activeAccountId: string | undefined,
  generation: number,
  currentGeneration: number
): boolean {
  return accountId === activeAccountId && generation === currentGeneration;
}
