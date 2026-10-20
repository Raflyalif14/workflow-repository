import { Router, RequestHandler } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { authenticateUser, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { sendError, sendSuccess } from '../utils/response.util';

const MAX_FILE = 4 * 1024 * 1024;
const publicCodes = new Set(['FACE_NONE', 'FACE_MULTIPLE', 'FACE_IMAGE_INVALID', 'FACE_INPUT_LIMIT', 'FACE_TIMEOUT', 'FACE_BUSY', 'FACE_PROCESS_FAILED']);
export function safeModelProvenance(value: any) {
  if (!value || !['modelSha256', 'detectorSha256'].every(k => typeof value[k] === 'string' && /^[0-9a-f]{64}$/.test(value[k])) ||
    !['modelVersion', 'detectorVersion', 'preprocessingVersion', 'runtimeVersion'].every(k => typeof value[k] === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(value[k])) || value.embeddingDimensions !== 128) return null;
  return { modelVersion: value.modelVersion, modelSha256: value.modelSha256, detectorVersion: value.detectorVersion,
    detectorSha256: value.detectorSha256, preprocessingVersion: value.preprocessingVersion, runtimeVersion: value.runtimeVersion, embeddingDimensions: value.embeddingDimensions };
}
export const experimentEnabled = () => process.env.FACE_EXPERIMENT_ENABLED === 'true';
export function internalFaceTarget() {
  const url = new URL(process.env.FACE_EXPERIMENT_URL || 'http://127.0.0.1:8765');
  const key = process.env.FACE_EXPERIMENT_INTERNAL_KEY || '';
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash || key.length < 32) throw Error('Invalid internal face service configuration');
  return { url: url.origin, key };
}

/** Exported factory is also used by isolated HTTP tests; production uses real authentication. */
export function createFaceExperimentRouter(auth: RequestHandler = authenticateUser) {
  const router = Router(), active = new Set<string>();
  router.use(auth);
  router.use((req: AuthenticatedRequest, res, next) => {
    if (!req.user?.isActive || req.user.mustChangePassword) { sendError(res, 'An eligible active account is required.', { code: 'FACE_ACCESS_DENIED' }, 403); return; }
    res.setHeader('Cache-Control', 'no-store'); next();
  });
  router.get('/capabilities', (_req, res) => {
    sendSuccess(res, 'Face experiment availability.', { enabled: experimentEnabled(), maxFileBytes: MAX_FILE, maxSide: 4096, maxPixels: 8000000 });
  });
  const limiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: (req: AuthenticatedRequest) => req.user!.userId,
    handler: (_req, res) => { sendError(res, 'Wait before trying another comparison.', { code: 'FACE_RATE_LIMIT' }, 429); } });
  router.post('/compare', (req, res, next) => {
    if (!experimentEnabled()) { sendError(res, 'The face experiment is disabled.', { code: 'FACE_DISABLED' }, 404); return; }
    next();
  }, limiter, (req: AuthenticatedRequest, res, next) => {
    const actor = req.user!.userId;
    if (active.has(actor)) { sendError(res, 'A comparison is already in progress.', { code: 'FACE_BUSY' }, 409); return; }
    if (active.size >= 2) { sendError(res, 'The local comparison capacity is busy.', { code: 'FACE_BUSY' }, 503); return; }
    active.add(actor); res.once('close', () => active.delete(actor));
    // Bound stalled multipart uploads before allocation; this affects only this route.
    req.setTimeout(15000, () => req.destroy()); next();
  }, (req, res, next) => {
    const uploadDeadline = setTimeout(() => req.destroy(), 15000);
    const disconnect = () => clearTimeout(uploadDeadline);
    res.once('close', disconnect);
    // Busboy emits partsLimit upon reaching the configured count. Files/fields
    // enforce exactly two file slots; allow the boundary after the second part.
    const parser = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE, files: 2, fields: 0, parts: 3 },
      fileFilter: (_req, file, done) => done(null, ['image/png', 'image/jpeg'].includes(file.mimetype)) }).fields([{ name: 'photoA', maxCount: 1 }, { name: 'photoB', maxCount: 1 }]);
    let finished = false;
    const complete = (error?: unknown) => {
      if (finished) return; finished = true;
      clearTimeout(uploadDeadline); res.removeListener('close', disconnect);
      if (req.aborted || res.destroyed) return;
      if (error) { sendError(res, 'Invalid comparison images.', { code: error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 'FACE_INPUT_LIMIT' : 'FACE_IMAGE_INVALID' }, error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 413 : 400); return; }
      next();
    };
    try { parser(req, res, complete); } catch (error) { complete(error); }
  }, async (req, res) => {
    req.setTimeout(0); // Multipart is complete; the bounded service deadline now owns the response.
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const a = files?.photoA?.[0]?.buffer, b = files?.photoB?.[0]?.buffer;
    let body: Uint8Array<ArrayBuffer> | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController(); let expired = false;
    const disconnect = () => { if (!res.writableEnded) abort.abort(); };
    res.once('close', disconnect);
    try {
      if (!a?.length || !b?.length) { sendError(res, 'Two valid images are required.', { code: 'FACE_IMAGE_INVALID' }, 400); return; }
      const target = internalFaceTarget();
      body = new Uint8Array(4 + a.length + b.length); new DataView(body.buffer).setUint32(0, a.length); body.set(a, 4); body.set(b, 4 + a.length);
      timer = setTimeout(() => { expired = true; abort.abort(); }, 15000);
      const response = await fetch(target.url + '/compare', { method: 'POST', redirect: 'error', signal: abort.signal,
        headers: { Authorization: 'Bearer ' + target.key, 'Content-Type': 'application/octet-stream' }, body });
      // The internal contract is small. Never forward arbitrary response/error fields.
      const reader = response.body?.getReader(); if (!reader) throw Error('Invalid service result');
      const chunks: Uint8Array[] = []; let length = 0;
      try {
        for (;;) {
          const part = await reader.read(); if (part.done) break;
          length += part.value.length; if (length > 2048) { await reader.cancel(); throw Error('Invalid service result'); }
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
      const raw = Buffer.concat(chunks).toString('utf8');
      const data = JSON.parse(raw);
      if (!response.ok || data.ok !== true) {
        const code = publicCodes.has(data.code) ? data.code : 'FACE_PROCESS_FAILED';
        sendError(res, 'The experiment could not complete.', { code, provenance: safeModelProvenance(data.provenance), ...(data.photo === 'A' || data.photo === 'B' ? { photo: data.photo } : {}) },
          code === 'FACE_TIMEOUT' ? 504 : ['FACE_NONE', 'FACE_MULTIPLE', 'FACE_IMAGE_INVALID', 'FACE_INPUT_LIMIT'].includes(code) ? 422 : 503); return;
      }
      const result = data.result;
      const provenance = safeModelProvenance(result?.provenance);
      if (!provenance || result?.model !== 'opencv-sface-2021dec' || result.metric !== 'cosine' || !Number.isFinite(result.score) || result.score < -1 || result.score > 1) throw Error('Invalid service result');
      if (!res.destroyed) sendSuccess(res, 'Experimental similarity only.', { model: result.model, metric: 'cosine', score: result.score, provenance });
    } catch {
      if (!res.destroyed && !res.writableEnded) sendError(res, 'The local comparison service is unavailable.', { code: expired ? 'FACE_TIMEOUT' : 'FACE_SERVICE_UNAVAILABLE' }, expired ? 504 : 503);
    } finally {
      clearTimeout(timer); res.removeListener('close', disconnect);
      body?.fill(0); for (const list of Object.values(files || {})) for (const file of list) file.buffer.fill(0);
      req.files = undefined;
    }
  });
  return router;
}
export default createFaceExperimentRouter();
