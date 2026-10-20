import { Router, RequestHandler } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { createHash } from 'node:crypto';
import { authenticateUser, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { sendError, sendSuccess } from '../utils/response.util';
import { readPadDiagnostics, completePadDiagnostics } from '../utils/face-pad-diagnostics';
import { readCaptureAnalysis } from '../utils/face-pad-analysis';
import { runFacePadAnalysis, runFacePadCandidate } from '../utils/run-face-pad-analysis';
import { readCandidateResult } from '../utils/face-pad-candidate';

const MAX_FILE = 4 * 1024 * 1024;
const codes = new Set(['FACE_NONE', 'FACE_MULTIPLE', 'FACE_IMAGE_INVALID', 'FACE_INPUT_LIMIT', 'PAD_BBOX_INVALID', 'PAD_MODEL_UNAVAILABLE', 'PAD_DETECTOR_UNAVAILABLE', 'PAD_PROCESS_FAILED', 'PAD_TIMEOUT', 'PAD_BUSY']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function safePadProvenance(p: any) {
  if (!p || p.model !== 'anti-spoof-mn3' || p.detector !== 'yunet-2023mar'
    || p.modelSha256 !== 'c4c99af04603b62d7e44f6f4daeb33e0daeccc696008c0b1d62f6f5cebbb3262'
    || p.detectorSha256 !== '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4'
    || p.cropVersion !== 'yunet-max-side-square-context-1.2-clip-v1'
    || p.preprocessingVersion !== 'mn3-original-onnx-rgb-cubic-128-v1'
    || !['runtimeVersion', 'pythonVersion'].every(k => typeof p[k] === 'string' && /^[0-9.]{1,24}$/.test(p[k]))) return null;
  return { model: p.model, modelSha256: p.modelSha256, detector: p.detector, detectorSha256: p.detectorSha256,
    cropVersion: p.cropVersion, preprocessingVersion: p.preprocessingVersion, runtimeVersion: p.runtimeVersion, pythonVersion: p.pythonVersion };
}
export function internalPadTarget() {
  const url = new URL(process.env.FACE_PAD_URL || 'http://127.0.0.1:8766'), key = process.env.FACE_PAD_INTERNAL_KEY || '';
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || key.length < 32) throw Error('Invalid internal PAD configuration');
  return { url: url.origin, key };
}
const enabled = () => process.env.FACE_PAD_ENABLED === 'true';
export function createFacePadRouter(auth: RequestHandler = authenticateUser) {
  const router = Router(), active = new Set<string>();
  router.use(auth);
  router.use((req: AuthenticatedRequest, res, next) => {
    if (!req.user?.isActive || req.user.mustChangePassword) { sendError(res, 'An eligible active account is required.', { code: 'PAD_ACCESS_DENIED' }, 403); return; }
    res.setHeader('Cache-Control', 'no-store'); next();
  });
  router.get('/capabilities', (_req, res) => sendSuccess(res, 'PAD experiment availability.', { enabled: enabled(), candidateEnabled: enabled() && process.env.NODE_ENV === 'development', maxFileBytes: MAX_FILE }));
  const limiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: (req: AuthenticatedRequest) => req.user!.userId,
    handler: (_req, res) => { sendError(res, 'Wait before another PAD attempt.', { code: 'PAD_RATE_LIMIT' }, 429); } });
  router.post(['/inspect', '/diagnose', '/candidate'], (req, res, next) => {
    if (!enabled()) { sendError(res, 'PAD experiment disabled.', { code: 'PAD_DISABLED' }, 404); return; } next();
  }, limiter, (req: AuthenticatedRequest, res, next) => {
    const actor = req.user!.userId;
    if (active.has(actor) || active.size >= 2) { sendError(res, 'PAD capacity busy.', { code: 'PAD_BUSY' }, 409); return; }
    active.add(actor); res.once('close', () => active.delete(actor));
    req.setTimeout(15000, () => req.destroy()); next();
  }, (req, res, next) => {
    const timer = setTimeout(() => req.destroy(), 15000);
    const clear = () => clearTimeout(timer); res.once('close', clear);
    const parser = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE, files: 1, fields: 2, fieldSize: 64, parts: 4 },
      fileFilter: (_req, file, done) => done(null, ['image/png', 'image/jpeg'].includes(file.mimetype)) }).single('photo');
    parser(req, res, error => {
      clear(); res.removeListener('close', clear);
      if (req.aborted || res.destroyed || error) {
        req.file?.buffer.fill(0); req.file = undefined;
        if (!req.aborted && !res.destroyed) sendError(res, 'Invalid PAD image.', { code: error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 'FACE_INPUT_LIMIT' : 'FACE_IMAGE_INVALID' }, error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 413 : 400);
        return;
      }
      next();
    });
  }, async (req, res) => {
    req.setTimeout(0);
    let body: Uint8Array<ArrayBuffer> | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController(); let expired = false;
    const disconnect = () => { if (!res.writableEnded) abort.abort(); }; res.once('close', disconnect);
    try {
      const { requestId, slot } = req.body || {}, photo = req.file?.buffer;
      if (!photo?.length || !uuid.test(requestId) || !['A', 'B'].includes(slot) || Object.keys(req.body).length !== 2) {
        sendError(res, 'Invalid PAD request.', { code: 'PAD_REQUEST_INVALID' }, 400); return;
      }
      if (req.path === '/diagnose' || req.path === '/candidate') {
        if (process.env.NODE_ENV !== 'development') { sendError(res, 'Local development analysis only.', { code: 'PAD_DISABLED' }, 404); return; }
        timer = setTimeout(() => { expired = true; abort.abort(); }, 15000);
        const raw: any = await (req.path === '/candidate' ? runFacePadCandidate : runFacePadAnalysis)(photo, abort.signal);
        if (raw?.status === 'ERROR' && codes.has(raw.reason)) { sendError(res, 'Capture analysis failed.', { code: raw.reason }, 422); return; }
        const analysis = req.path === '/candidate' ? readCandidateResult(raw) : readCaptureAnalysis(raw);
        if (!analysis || analysis.imageSha256 !== createHash('sha256').update(photo).digest('hex')) throw Error('Invalid capture analysis');
        sendSuccess(res, 'Temporary same-capture analysis.', { requestId, slot, ...analysis }); return;
      }
      const target = internalPadTarget(), meta = Buffer.from(JSON.stringify({ requestId, slot }));
      body = new Uint8Array(4 + meta.length + photo.length);
      new DataView(body.buffer).setUint32(0, meta.length); body.set(meta, 4); body.set(photo, 4 + meta.length);
      timer = setTimeout(() => { expired = true; abort.abort(); }, 15000);
      const response = await fetch(target.url + '/inspect', { method: 'POST', redirect: 'error', signal: abort.signal,
        headers: { Authorization: 'Bearer ' + target.key, 'Content-Type': 'application/octet-stream' }, body });
      const reader = response.body?.getReader(); if (!reader) throw Error('Invalid result');
      const chunks: Uint8Array[] = []; let length = 0;
      try {
        for (;;) { const part = await reader.read(); if (part.done) break;
          length += part.value.length; if (length > 4096) { await reader.cancel(); throw Error('Invalid result'); } chunks.push(part.value); }
      } finally { reader.releaseLock(); }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!response.ok) { sendError(res, 'PAD service failed.', { code: codes.has(data.code) ? data.code : 'PAD_PROCESS_FAILED' }, 503); return; }
      if (data.requestId !== requestId || data.slot !== slot || data.prediction !== null) throw Error('Invalid result binding');
      const diagnostics = readPadDiagnostics(data.diagnostics);
      if (diagnostics === undefined || data.status === 'SUCCESS' && diagnostics !== null && !completePadDiagnostics(diagnostics)) throw Error('Invalid geometry contract');
      if (data.status === 'ERROR' && codes.has(data.reason) && data.probabilities === null) {
        sendError(res, 'PAD processing failed.', { code: data.reason, requestId, slot, provenance: safePadProvenance(data.provenance), diagnostics }, data.reason === 'PAD_TIMEOUT' ? 504 : 422); return;
      }
      const p = data.probabilities, provenance = safePadProvenance(data.provenance);
      if (data.status !== 'SUCCESS' || !provenance || !p || ![p.real, p.spoof].every(n => Number.isFinite(n) && n >= 0 && n <= 1)
        || Math.abs(p.real + p.spoof - 1) > 1e-5 || data.imageSha256 !== createHash('sha256').update(photo).digest('hex')
        || !Number.isFinite(Date.parse(data.processedAt)) || !Number.isFinite(data.durationMs) || data.durationMs < 0) throw Error('Invalid result');
      sendSuccess(res, 'Experimental PAD probabilities only.', { requestId, slot, status: 'SUCCESS', reason: null, prediction: null,
        probabilities: { real: p.real, spoof: p.spoof }, provenance, imageSha256: data.imageSha256, processedAt: data.processedAt, durationMs: data.durationMs, diagnostics });
    } catch {
      if (!res.destroyed && !res.writableEnded) sendError(res, 'Local PAD service unavailable.', { code: expired ? 'PAD_TIMEOUT' : 'PAD_SERVICE_UNAVAILABLE' }, expired ? 504 : 503);
    } finally {
      clearTimeout(timer); res.removeListener('close', disconnect); body?.fill(0); req.file?.buffer.fill(0); req.file = undefined;
    }
  });
  return router;
}
export default createFacePadRouter();
