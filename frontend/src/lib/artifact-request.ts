import { getAuthSession } from './auth';

// Per-hook, per-session receipts. Immutable File identities survive rebuilding
// FormData after a failed submit; a successful intentional repeat gets a new ID.
export function createArtifactRequests(session = () => getAuthSession()?.id, uuid = () => crypto.randomUUID()) {
  let scope: string | undefined;
  const pending = new Map<string, string>();
  const files = new WeakMap<object, string>();
  const normalize = (value: unknown): unknown => {
    if (typeof Blob !== 'undefined' && value instanceof Blob) {
      if (!files.has(value)) files.set(value, uuid());
      return { file: files.get(value) };
    }
    if (typeof FormData !== 'undefined' && value instanceof FormData) return Array.from(value.entries()).map(([key, item]) => [key, normalize(item)]);
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
    return value;
  };
  return async <T>(input: unknown, send: (requestId: string) => Promise<T>): Promise<T> => {
    const next = session();
    if (scope !== next) { pending.clear(); scope = next; }
    const key = JSON.stringify(normalize(input));
    const id = pending.get(key) ?? uuid();
    pending.set(key, id);
    const result = await send(id);
    if (scope === next && pending.get(key) === id) pending.delete(key);
    return result;
  };
}
