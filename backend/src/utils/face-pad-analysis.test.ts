import assert from 'node:assert/strict';
import { readCaptureAnalysis } from './face-pad-analysis';
const { readCaptureAnalysis: readFrontend } = require('../../../frontend/src/lib/face-pad-analysis');

const fixture = () => ({ schemaVersion: 'pad-capture-analysis-v1', status: 'SUCCESS', prediction: null,
  imageSha256: 'a'.repeat(64), modelSha256: 'c4c99af04603b62d7e44f6f4daeb33e0daeccc696008c0b1d62f6f5cebbb3262',
  frame: { width: 640, height: 480 }, decoderMaxDifference: 0, preprocessingMaxDifference: 0,
  brightnessMean: 100, contrastStd: 30, laplacianVariance: 60,
  cropResults: ['CURRENT', 'REFERENCE_RECT', 'FACE_BOX'].map(id => ({ id,
    rect: { left: 100, top: 80, right: 300, bottom: 280 },
    opencv: { real: .0004, spoof: .9996 }, onnx: { real: .0004, spoof: .9996 },
    maxDifference: 0, runtimeMatches: true, deterministic: true })) });

for (const read of [readCaptureAnalysis, readFrontend]) {
  assert.deepEqual(read(fixture()), fixture());
  for (const mutate of [
    (v: any) => { v.prediction = 'LIVE'; }, (v: any) => { v.modelSha256 = 'b'.repeat(64); },
    (v: any) => { v.imageSha256 = 'bad'; }, (v: any) => { v.frame.width = 9000; },
    (v: any) => { v.decoderMaxDifference = -1; }, (v: any) => { v.preprocessingMaxDifference = NaN; },
    (v: any) => { v.cropResults[0].rect.right = 800; }, (v: any) => { v.cropResults[0].rect.right = 100; },
    (v: any) => { v.cropResults[0].opencv.real = 3; }, (v: any) => { v.cropResults.pop(); },
    (v: any) => { v.cropResults.reverse(); }, (v: any) => { v.cropResults[0].runtimeMatches = false; },
    (v: any) => { v.cropResults[0].onnx = { real: .2, spoof: .8 }; },
  ]) { const value = fixture(); mutate(value); assert.equal(read(value), null); }
  const different = fixture(); different.cropResults[0].onnx = { real: .2, spoof: .8 };
  different.cropResults[0].runtimeMatches = false; different.cropResults[0].maxDifference = .1996;
  assert(read(different), 'A real runtime discrepancy must remain reportable');
  const extra: any = fixture(); extra.pixels = 'private'; extra.cropResults[0].rect.landmarks = 'private';
  assert(!JSON.stringify(read(extra)).includes('private'), 'Project known numeric fields only');
}
console.log('Capture analysis contracts PASS: backend/frontend parity, malformed results, discrepancies and safe projection');
