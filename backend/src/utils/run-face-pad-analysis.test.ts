import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { runFacePadAnalysis } from './run-face-pad-analysis';
import { readCaptureAnalysis } from './face-pad-analysis';

async function run() {
  const root = path.resolve(__dirname, '../../..');
  // PNG derivative stays in this process; source is the existing public fixture.
  const prepared = spawnSync(path.join(root, '.cache/face-pad-runtime-comparison/Scripts/python.exe'),
    ['-B', '-c', 'import cv2,sys;im=cv2.imread(sys.argv[1]);sys.stdout.buffer.write(cv2.imencode(".png",im)[1].tobytes())',
      path.join(root, 'services/face-experiment/tests/fixtures/same-person-a.jpg')], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(prepared.status, 0);
  const photo = prepared.stdout;
  try {
    const analysis = readCaptureAnalysis(await runFacePadAnalysis(photo, new AbortController().signal));
    assert(analysis); assert.equal(analysis.imageSha256, crypto.createHash('sha256').update(photo).digest('hex'));
    assert(analysis.cropResults.every(row => row.runtimeMatches && row.deterministic));
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(runFacePadAnalysis(photo, cancelled.signal), /PAD_TIMEOUT/);
    const children = require('node:child_process'), original = children.spawn;
    let closed!: Promise<unknown>;
    children.spawn = (...args: any[]) => {
      assert(!String(args[0]).includes('Scripts'), 'No redirector/grandchild holds image bytes after cancellation');
      const child = original(...args); closed = once(child, 'close'); return child;
    };
    try {
      const abort = new AbortController(); const pending = runFacePadAnalysis(photo, abort.signal);
      abort.abort(); await assert.rejects(pending, /PAD_TIMEOUT/); await closed;
    } finally { children.spawn = original; }
    console.log('Capture analysis process PASS: real pinned runtimes/public fixture, SHA binding, pre-abort and cancellation closes direct Python process');
  } finally { photo.fill(0); }
}
void run().catch(e => { console.error(e); process.exitCode = 1; });
