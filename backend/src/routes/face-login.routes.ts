import { Router, RequestHandler, Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import multer from 'multer';
import { authenticateUser, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { sendError, sendSuccess } from '../utils/response.util';
import { deviceStatus, listFaceDevices, faceLoginEnabled, faceSingleGlanceEnabled, faceLoginOrigin, finishFaceChallenge, removeAllFaceDevices, removeFaceDevice, startFaceChallenge, startFacePassiveTest } from '../services/face-login.service';

const errors = new Set(['FACE_DISABLED', 'FACE_ACCESS_DENIED', 'FACE_DEVICE_INVALID', 'FACE_DEVICE_MISSING', 'FACE_DEVICE_EXISTS', 'FACE_STORE_UNAVAILABLE',
  'FACE_PASSWORD_INVALID', 'FACE_RATE_LIMIT', 'FACE_BUSY', 'FACE_CHALLENGE_EXPIRED', 'FACE_IMAGE_INVALID', 'FACE_INPUT_LIMIT', 'FACE_NONE', 'FACE_MULTIPLE',
  'FACE_POSITION_REQUIRED', 'FACE_LIVENESS_FAILED', 'FACE_MOTION_REQUIRED', 'FACE_NO_MATCH', 'FACE_AUTH_UNAVAILABLE', 'FACE_PROCESS_FAILED']);
function fail(res: Response, error: unknown) {
  const code = error instanceof Error && errors.has(error.message) ? error.message : 'FACE_PROCESS_FAILED';
  const status = code === 'FACE_DISABLED' ? 404 : code === 'FACE_RATE_LIMIT' ? 429 : code === 'FACE_BUSY' ? 409
    : ['FACE_STORE_UNAVAILABLE', 'FACE_AUTH_UNAVAILABLE', 'FACE_PROCESS_FAILED'].includes(code) ? 503 : 422;
  if (!res.destroyed && !res.writableEnded) sendError(res, 'Camera sign-in could not complete.', { code }, status);
}
export function createFaceLoginRouter(auth: RequestHandler = authenticateUser) {
  const router = Router(); let active = 0;
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Pragma', 'no-cache'); next(); });
  router.get('/capabilities', (_req, res) => sendSuccess(res, 'Camera sign-in availability.', { enabled: faceLoginEnabled(), singleGlance: faceSingleGlanceEnabled(), localOnly: true }));
  router.use((req, res, next) => {
    try { if (!faceLoginEnabled()) throw Error('FACE_DISABLED'); faceLoginOrigin(req.headers.origin); next(); } catch (error) { fail(res, error); }
  });
  router.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, res) => sendError(res, 'Wait before another camera request.', { code: 'FACE_RATE_LIMIT' }, 429) }));
  const failedRequests = rateLimit({ windowMs: 10*60_000, limit: 20, skipSuccessfulRequests: true,
    keyGenerator: req => ipKeyGenerator(req.ip || ''), standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, res) => sendError(res, 'Wait before another camera sign-in.', { code: 'FACE_RATE_LIMIT' }, 429) });
  router.use(failedRequests);
  const eligible: RequestHandler = (req: AuthenticatedRequest, res, next) => {
    if (!req.user?.isActive || req.user.mustChangePassword) { fail(res, Error('FACE_ACCESS_DENIED')); return; } next();
  };
  router.get('/devices', auth, eligible, async (req: AuthenticatedRequest, res) => {
    try { sendSuccess(res, 'Registered camera sign-in devices.', await listFaceDevices(req.user!.userId)); } catch (error) { fail(res, error); }
  });
  router.get('/device/:deviceId', auth, eligible, async (req: AuthenticatedRequest, res) => {
    try { sendSuccess(res, 'Registered device status.', await deviceStatus(req.user!.userId, String(req.params.deviceId))); } catch (error) { fail(res, error); }
  });
  router.post('/enroll/start', auth, eligible, async (req: AuthenticatedRequest, res) => {
    try { sendSuccess(res, 'Camera enrollment challenge.', await startFaceChallenge(req.body, req.headers.origin!, req.user!.userId, req.get('user-agent'))); }
    catch (error) { fail(res, error); } finally { if (req.body) req.body.password = undefined; }
  });
  router.post('/login/start', async (req, res) => {
    try { sendSuccess(res, 'Camera sign-in challenge.', await startFaceChallenge(req.body, req.headers.origin!, undefined, req.get('user-agent'))); }
    catch (error) { fail(res, error); }
  });
  router.post('/passive-test/start', auth, eligible, async (req: AuthenticatedRequest, res) => {
    try { sendSuccess(res, 'Passive camera test challenge.', await startFacePassiveTest(req.body, req.headers.origin!, req.user!.userId)); }
    catch (error) { fail(res, error); }
  });
  const parse: RequestHandler = (req, res, next) => {
    if (active >= 2) { fail(res, Error('FACE_BUSY')); return; } active++;
    let released = false; const release = () => { if (!released) { released = true; active--; } };
    res.once('close', release); req.setTimeout(15000, () => req.destroy());
    const timer = setTimeout(() => req.destroy(), 15000); res.once('close', () => clearTimeout(timer));
    multer({ storage: multer.memoryStorage(), limits: { files: 3, fileSize: 4*1024*1024, fields: 1, fieldSize: 4096, parts: 5 },
      fileFilter: (_req, file, done) => done(null, ['image/png', 'image/jpeg'].includes(file.mimetype)) }).array('frames', 3)(req, res, error => {
      clearTimeout(timer); req.setTimeout(0);
      if (error || req.aborted || res.destroyed) {
        for (const file of Array.isArray(req.files) ? req.files : []) file.buffer.fill(0); req.files = undefined;
        release(); fail(res, Error(error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 'FACE_INPUT_LIMIT' : 'FACE_IMAGE_INVALID')); return;
      }
      next();
    });
  };
  async function complete(req: AuthenticatedRequest, res: Response, passiveTest = false) {
    const files = Array.isArray(req.files) ? req.files : [], abort = new AbortController();
    const disconnect = () => { if (!res.writableEnded) abort.abort(); }; res.once('close', disconnect);
    const timer = setTimeout(() => abort.abort(), 20000);
    try {
      if (files.length !== 3 || Object.keys(req.body || {}).join() !== 'proof') throw Error('FACE_IMAGE_INVALID');
      const data = JSON.parse(req.body.proof);
      const result = await finishFaceChallenge(data, files.map(f => f.buffer), req.headers.origin!, abort.signal, req.user?.userId, passiveTest);
      if (!passiveTest && !req.user?.userId) await failedRequests.resetKey(ipKeyGenerator(req.ip || ''));
      sendSuccess(res, 'Camera verification completed.', result);
    } catch (error) { fail(res, abort.signal.aborted ? Error('FACE_CHALLENGE_EXPIRED') : error); }
    finally { clearTimeout(timer); res.removeListener('close', disconnect); files.forEach(f => f.buffer.fill(0)); req.files = undefined; req.body = {}; }
  }
  router.post('/enroll/finish', auth, eligible, parse, (req, res) => void complete(req, res));
  router.post('/login/finish', parse, (req, res) => void complete(req, res));
  router.post('/passive-test/finish', auth, eligible, parse, (req, res) => void complete(req, res, true));
  router.post('/device/remove', auth, eligible, async (req: AuthenticatedRequest, res) => {
    try { sendSuccess(res, 'Camera sign-in removed.', await removeFaceDevice(req.user!.userId, req.body?.deviceId, req.body?.password)); }
    catch (error) { fail(res, error); } finally { if (req.body) req.body.password = undefined; }
  });
  router.post('/devices/remove-all', auth, eligible, async (req: AuthenticatedRequest, res) => {
    try { sendSuccess(res, 'All camera sign-in devices removed.', await removeAllFaceDevices(req.user!.userId, req.body?.password)); }
    catch (error) { fail(res, error); } finally { if (req.body) req.body.password = undefined; }
  });
  return router;
}
export default createFaceLoginRouter();
