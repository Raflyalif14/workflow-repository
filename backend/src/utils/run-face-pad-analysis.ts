import { spawn } from 'node:child_process';
import path from 'node:path';
import { readFileSync } from 'node:fs';

/** Fixed local interpreter/script. Pixels only pass over stdin; no shell or disk upload. */
export function runFacePadAnalysis(photo: Buffer, signal: AbortSignal): Promise<unknown> {
  return runFacePadJob(photo, signal, 'analysis');
}
export function runFacePadCandidate(photo: Buffer, signal: AbortSignal): Promise<unknown> {
  return runFacePadJob(photo, signal, 'candidate');
}
export function runFaceLoginJob(payload: Buffer, signal: AbortSignal): Promise<unknown> {
  return runFacePadJob(payload, signal, 'login');
}
function runFacePadJob(photo: Buffer, signal: AbortSignal, job: 'analysis' | 'candidate' | 'login'): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(Error('PAD_TIMEOUT')); return; }
    const root = path.resolve(__dirname, '../../..');
    const runtime = path.join(root, '.cache/face-pad-runtime-comparison');
    const base = /^home\s*=\s*(.+)$/m.exec(readFileSync(path.join(runtime, 'pyvenv.cfg'), 'utf8'))?.[1].trim();
    if (!base || !path.isAbsolute(base)) { reject(Error('PAD_PROCESS_FAILED')); return; }
    const script = path.join(root, 'services/face-anti-spoofing', { analysis: 'diagnose_capture.py', candidate: 'minifas_candidate.py', login: 'face_login_inference.py' }[job]);
    // Windows venv python.exe redirects to another process. Start its base
    // interpreter directly so cancellation terminates the process holding pixels.
    // Isolated/no-site mode loads only the pinned environment plus this script.
    const bootstrap = 'import sys,runpy;sys.path[:0]=sys.argv[1:3];runpy.run_path(sys.argv[3],run_name="__main__")';
    const child = spawn(path.join(base, 'python.exe'),
      ['-I', '-S', '-B', '-c', bootstrap, path.join(runtime, 'Lib/site-packages'), path.dirname(script), script],
      { windowsHide: true, cwd: root, stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, OPENCV_LOG_LEVEL: 'SILENT' } });
    let done = false, length = 0; const chunks: Buffer[] = [];
    const abort = () => finish(Error('PAD_TIMEOUT'));
    const finish = (error?: Error, value?: unknown) => {
      if (done) return; done = true; signal.removeEventListener('abort', abort);
      if (child.exitCode === null) child.kill(); child.stdin.destroy();
      chunks.forEach(chunk => chunk.fill(0)); chunks.length = 0;
      error ? reject(error) : resolve(value);
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    child.on('error', () => finish(Error('PAD_PROCESS_FAILED')));
    child.stdin.on('error', () => finish(Error('PAD_PROCESS_FAILED')));
    child.stdout.on('data', (chunk: Buffer) => {
      if (done) { chunk.fill(0); return; } length += chunk.length;
      if (length > 8192) { chunk.fill(0); finish(Error('PAD_PROCESS_FAILED')); return; } chunks.push(chunk);
    });
    child.on('close', code => {
      if (done) return;
      try { if (code !== 0) throw Error(); const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); finish(undefined, value); }
      catch { finish(Error('PAD_PROCESS_FAILED')); }
    });
    child.stdin.end(photo);
  });
}
