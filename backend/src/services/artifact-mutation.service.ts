import { createHash, randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import { DocumentStorageService } from '../utils/storage.util';

type Operation = 'VERSION' | 'REVIEW' | 'COMMENT' | 'CONTRIBUTION' | 'PROMOTE';
type ReservedFile = { id: string; path: string; name: string; mime: string; size: number };
export class ArtifactMutationError extends Error {
  constructor(readonly statusCode: number) { super('Artifact mutation failed'); }
}
export const artifactFileManifest = (files: Express.Multer.File[]) => files.map(file => ({
  name: file.originalname, mime: file.mimetype || 'application/octet-stream', size: file.size,
  sha256: createHash('sha256').update(file.buffer).digest('hex'),
}));

export class ArtifactMutationService {
  static async execute(actorId: string, operation: Operation, payload: Record<string, unknown>,
    requestId: string = randomUUID(), transfer?: (files: ReservedFile[]) => Promise<void>) {
    const call = async (step: string, token?: string) => {
      const { data, error } = await supabaseAdmin.rpc('mutate_official_artifact', {
        p_actor_id: actorId, p_request_id: requestId, p_operation: operation,
        p_payload: payload, p_step: step, p_token: token ?? null,
      });
      if (error) throw new ArtifactMutationError(error.code === '42501' ? 403 : error.code === 'P0002' ? 404
        : ['40001','55000','55P03','23505'].includes(error.code) ? 409 : error.code === '22023' ? 400 : 500);
      if (!data || typeof data.state !== 'string') throw new ArtifactMutationError(500);
      return data;
    };
    const previous = await call('LOOKUP');
    if (previous.state === 'COMMITTED') return previous.result;
    if (!transfer) return (await call('COMMIT')).result;
    const reserved = await call('RESERVE');
    if (reserved.state === 'COMMITTED') return reserved.result;
    try {
      await transfer(reserved.files);
      return (await call('COMMIT', reserved.token)).result;
    } catch (failure) {
      // Never infer rollback from an HTTP/network error. CANCEL locks and fences
      // against a late COMMIT; only its exact unreferenced paths may be removed.
      try {
        const outcome = await call('CANCEL', reserved.token);
        if (outcome.state === 'COMMITTED') return outcome.result;
        if (outcome.state === 'FROZEN') await DocumentStorageService.removeMany(outcome.files.map((file: ReservedFile) => file.path));
      } catch {
        // Durable reservation retains exact paths for manual reconciliation.
        console.error('[ArtifactMutation] Recovery requires inspection.', { requestId });
      }
      throw failure instanceof ArtifactMutationError ? failure : new ArtifactMutationError(500);
    }
  }
}
