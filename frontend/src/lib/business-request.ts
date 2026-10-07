export function createBusinessRequestStore() {
  const intents = new Map<string, { id: string; expected: string }>();
  const running = new Map<string, Promise<unknown>>();
  return {
    run<T>(project: string, action: string, payload: unknown, timestamp: () => Promise<string | undefined>,
      send: (headers: Record<string, string>) => Promise<T>, refresh: () => void): Promise<T> {
      const key = JSON.stringify([project, action, payload]);
      const existing = running.get(key);
      if (existing) return existing as Promise<T>;
      const operation = Promise.resolve().then(async () => {
        try {
          let intent = intents.get(key);
          if (!intent) {
            const expected = await timestamp();
            if (!expected) throw new Error("Unable to save changes.");
            intent = { id: crypto.randomUUID(), expected };
            intents.set(key, intent);
          }
          const result = await send({ "x-business-request-id": intent.id, "x-business-expected-updated-at": intent.expected });
          intents.delete(key);
          return result;
        } catch (error) {
          if ((error as { status?: number; statusCode?: number })?.status === 409 || (error as { statusCode?: number })?.statusCode === 409) {
            intents.delete(key); refresh();
          }
          throw error;
        } finally { running.delete(key); }
      });
      running.set(key, operation);
      return operation;
    },
  };
}
