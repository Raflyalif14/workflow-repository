export type PicRequest = { id: string; revision: string; signature: string };
/** Caller captures the server revision when reviewing; never substitute a refreshed revision on retry. */
export function retainPicRequest(previous: PicRequest | null, revision: string, payload: Record<string, unknown>): PicRequest {
  const signature = JSON.stringify([revision, payload]);
  return previous?.signature === signature ? previous : { signature, revision, id: crypto.randomUUID() };
}
export function picErrorKey(code?: string) {
  if (code === 'PIC_CONFLICT') return 'picOperation.conflict' as const;
  if (code === 'PIC_FORBIDDEN' || code === 'PIC_NOT_EDITABLE') return 'picOperation.notEditable' as const;
  if (code === 'PIC_INVALID') return 'picOperation.invalid' as const;
  return 'picOperation.failed' as const;
}
