import { randomUUID } from 'crypto';
import { Request } from 'express';
import { ArtifactMutationError } from '../services/artifact-mutation.service';

// Optional additive header: existing callers/body/response remain compatible.
export function artifactRequestId(req: Request): string {
  const value = req.get('Idempotency-Key');
  if (!value) return randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new ArtifactMutationError(400);
  return value;
}
