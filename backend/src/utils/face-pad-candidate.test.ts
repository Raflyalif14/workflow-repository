import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { runFacePadCandidate } from './run-face-pad-analysis';
import { readCandidateResult } from './face-pad-candidate';

async function run() {
  const root = path.resolve(__dirname, '../../..');
  assert.equal(readFileSync(path.join(root, 'frontend/src/lib/face-pad-candidate.ts'), 'utf8'),
    readFileSync(path.join(root, 'backend/src/utils/face-pad-candidate.ts'), 'utf8'), 'Same contract on both sides');
  const photo = readFileSync(path.join(root, 'services/face-experiment/tests/fixtures/same-person-a.jpg'));
  try {
    const deadline = new AbortController(), timeout = setTimeout(() => deadline.abort(), 15000);
    let output: any;
    try { output = await runFacePadCandidate(photo, deadline.signal); } finally { clearTimeout(timeout); }
    const result = readCandidateResult(output); assert(result);
    assert.equal(result.imageSha256, crypto.createHash('sha256').update(photo).digest('hex'));
    assert(Math.abs(result.candidate.probabilities.real - .7488130331) < 1e-5);
    assert.equal(result.prediction, null);
    for (const change of [
      (v: any) => { v.prediction = 'LIVE'; },
      (v: any) => { v.imageSha256 = 'not-a-hash'; },
      (v: any) => { v.candidate.models[0].onnxSha256 = 'f'.repeat(64); },
      (v: any) => { v.candidate.models.reverse(); },
      (v: any) => { v.candidate.models[0].classes = [0, 0, 0]; },
      (v: any) => { v.candidate.models[0].classes[1] = NaN; },
      (v: any) => { v.candidate.models[0].rect.right = v.frame.width + 1; },
      (v: any) => { v.candidate.models[0].scale = 1; },
      (v: any) => { v.candidate.probabilities = { real: .99, spoof: .01 }; },
      (v: any) => { v.baseline.real = -1; },
    ]) {
      const invalid = structuredClone(output); change(invalid); assert.equal(readCandidateResult(invalid), null);
    }
    const extra = readCandidateResult({ ...output, privatePixels: 'must-not-escape' });
    assert(!JSON.stringify(extra).includes('must-not-escape'));
    const abort = new AbortController(); abort.abort();
    await assert.rejects(runFacePadCandidate(photo, abort.signal), /PAD_TIMEOUT/);
    console.log('Candidate PASS: actual pinned ONNX/public fixture under route deadline, checksum, model/class/crop guards, projection and pre-abort. No PAD accuracy claim.');
  } finally { photo.fill(0); }
}
void run().catch(e => { console.error(e); process.exitCode = 1; });
