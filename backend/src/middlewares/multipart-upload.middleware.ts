import { RequestHandler } from 'express';
import { sendError } from '../utils/response.util';

// Keep route-specific response statuses, but never expose parser errors/stacks.
export function handleMultipartUpload(parser: RequestHandler, message: string, errorStatus = 400): RequestHandler {
  return (req, res, next) => {
    if (req.aborted || res.destroyed) return;
    let finished = false;
    const complete = (error?: unknown) => {
      if (finished) return;
      finished = true;
      // Multer cleans its in-memory files on abort. A disconnected upload must
      // never continue to a controller or attempt a response on the dead socket.
      if (req.aborted || res.destroyed || res.writableEnded) return;
      if (error) {
        sendError(res, message, null, errorStatus);
        return;
      }
      next();
    };
    try { parser(req, res, complete); }
    catch (error) { complete(error); }
  };
}
