export type ProjectFormValues = {
  name: string; customer: string; scenarioId: string; estimatedRevenue: string; selectedOptionalKeys: string[];
  mom: File | null; photos: File[]; documents: File[];
};
export type ProjectDraftSubmission = { requestId: string; selectedDocumentKeys: string[] };
export type ProjectFormDraft = { version: 1; accountId: string; revision: string; savedAt: number;
  values: ProjectFormValues; submission?: ProjectDraftSubmission };
export const PROJECT_DRAFT_DATABASE = 'workflow-form-drafts';
const STORE = 'project-create';
export class DraftConflictError extends Error { constructor() { super('Draft changed in another tab'); } }

export function emptyProjectForm(): ProjectFormValues {
  return { name: '', customer: '', scenarioId: '', estimatedRevenue: '', selectedOptionalKeys: [], mom: null, photos: [], documents: [] };
}
export function hasProjectFormValues(values: ProjectFormValues) {
  return Boolean(values.name || values.customer || values.scenarioId || values.estimatedRevenue || values.selectedOptionalKeys.length
    || values.mom || values.photos.length || values.documents.length);
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isProjectFormDraft(value: unknown, accountId: string): value is ProjectFormDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as ProjectFormDraft, fields = draft.values;
  const strings = (items: unknown): items is string[] => Array.isArray(items) && items.length <= 100 && items.every(item => typeof item === 'string' && item.length <= 1000);
  const files = (items: unknown): items is File[] => Array.isArray(items) && items.length <= 10 && items.every(item => item instanceof File && item.size <= 50 * 1024 * 1024);
  return draft.version === 1 && draft.accountId === accountId && typeof draft.revision === 'string' && uuid.test(draft.revision)
    && Number.isFinite(draft.savedAt) && Boolean(fields)
    && [fields.name, fields.customer, fields.scenarioId, fields.estimatedRevenue].every(field => typeof field === 'string' && field.length <= 10000)
    && strings(fields.selectedOptionalKeys) && (fields.mom === null || fields.mom instanceof File && fields.mom.size <= 50 * 1024 * 1024)
    && files(fields.photos) && files(fields.documents)
    && (draft.submission === undefined || Boolean(draft.submission) && typeof draft.submission.requestId === 'string' && uuid.test(draft.submission.requestId) && strings(draft.submission.selectedDocumentKeys));
}

function openDraftDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Draft storage unavailable')); return; }
    let abandoned = false;
    const request = indexedDB.open(PROJECT_DRAFT_DATABASE, 1);
    const timer = setTimeout(() => { abandoned = true; reject(new Error('Draft storage timed out')); }, 10000);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onerror = () => { clearTimeout(timer); reject(request.error); };
    request.onblocked = () => { abandoned = true; clearTimeout(timer); reject(new Error('Draft storage blocked')); };
    request.onsuccess = () => { clearTimeout(timer); if (abandoned) request.result.close(); else resolve(request.result); };
  });
}

export async function readProjectFormDraft(accountId: string): Promise<ProjectFormDraft | null> {
  const db = await openDraftDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).get(accountId);
      transaction.onabort = () => reject(transaction.error);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => {
        if (request.result === undefined) resolve(null);
        else if (isProjectFormDraft(request.result, accountId)) resolve(request.result);
        else reject(new Error('Invalid saved draft'));
      };
    });
  } finally { db.close(); }
}

export async function writeProjectFormDraft(accountId: string, values: ProjectFormValues | null,
  expectedRevision: string | null, submission?: ProjectDraftSubmission): Promise<ProjectFormDraft | null> {
  const db = await openDraftDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite', { durability: 'strict' });
      const store = transaction.objectStore(STORE), read = store.get(accountId);
      let conflict = false;
      let storageError: unknown;
      let record: ProjectFormDraft | null = null;
      read.onsuccess = () => {
        try {
          if ((read.result?.revision || null) !== expectedRevision) { conflict = true; transaction.abort(); return; }
          if (values) {
            record = { version: 1, accountId, revision: crypto.randomUUID(), savedAt: Date.now(), values, ...(submission ? { submission } : {}) };
            if (!isProjectFormDraft(record, accountId)) { transaction.abort(); return; }
            store.put(record, accountId);
          } else store.delete(accountId);
        } catch (error) { storageError = error; transaction.abort(); }
      };
      transaction.oncomplete = () => resolve(record);
      transaction.onabort = () => reject(conflict ? new DraftConflictError() : storageError || transaction.error || new Error('Draft could not be saved'));
      transaction.onerror = () => { /* onabort owns the final result. */ };
    });
  } finally { db.close(); }
}

// Serialize autosaves, final-confirmation persistence and deletion. Older writes cannot revive a cleared draft.
export function createProjectDraftSession(accountId: string) {
  let revision: string | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let stopped = false;
  let conflict = false;
  const serial = <T>(action: () => Promise<T>) => {
    const result = queue.catch(() => undefined).then(() => {
      if (stopped) throw new Error('Draft session closed');
      if (conflict) throw new DraftConflictError();
      return action();
    });
    queue = result;
    return result;
  };
  return {
    load: () => serial(async () => { const draft = await readProjectFormDraft(accountId); revision = draft?.revision || null; return draft; }),
    save: (values: ProjectFormValues | null, submission?: ProjectDraftSubmission) => serial(async () => {
      try {
        const draft = await writeProjectFormDraft(accountId, values, revision, submission); revision = draft?.revision || null; return draft;
      } catch (error) { if (error instanceof DraftConflictError) conflict = true; throw error; }
    }),
    close: () => { stopped = true; },
  };
}
