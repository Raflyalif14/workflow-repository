import assert from 'node:assert/strict';
import { readPadDiagnostics, completePadDiagnostics } from './face-pad-diagnostics';
const center = { version: 'pad-geometry-v1', frame: { width: 240, height: 200 }, faceCount: 1,
  bbox: { x: 80, y: 60, width: 40, height: 60, confidence: .95 },
  cropBeforeClip: { left: 64, top: 54, right: 136, bottom: 126 }, cropAfterClip: { left: 64, top: 54, right: 136, bottom: 126 },
  roi: { width: 72, height: 72 }, clipped: { left: false, top: false, right: false, bottom: false } };
assert.deepEqual(readPadDiagnostics(center), center); assert(completePadDiagnostics(readPadDiagnostics(center)!));
const edge = { ...center, bbox: { x: 0, y: 0, width: 40, height: 60, confidence: .95 },
  cropBeforeClip: { left: -16, top: -6, right: 56, bottom: 66 }, cropAfterClip: { left: 0, top: 0, right: 56, bottom: 66 },
  roi: { width: 56, height: 66 }, clipped: { left: true, top: true, right: false, bottom: false } };
assert.deepEqual(readPadDiagnostics(edge), edge);
for (const count of [0, 2, null]) {
  const partial = { ...center, faceCount: count, bbox: null, cropBeforeClip: null, cropAfterClip: null, roi: null, clipped: null };
  assert.deepEqual(readPadDiagnostics(partial), partial); assert.equal(completePadDiagnostics(readPadDiagnostics(partial)!), false);
}
const empty = { ...center, frame: null, faceCount: null, bbox: null, cropBeforeClip: null, cropAfterClip: null, roi: null, clipped: null };
assert.deepEqual(readPadDiagnostics(empty), empty);
assert.equal(readPadDiagnostics(undefined), null); assert.equal(readPadDiagnostics(null), null);
const bad = [[], {}, { ...center, version: 'other' }, { ...center, frame: { width: '240', height: 200 } },
  { ...center, frame: { width: 4097, height: 200 } }, { ...center, faceCount: -1 }, { ...center, faceCount: 1.5 },
  { ...center, bbox: { ...center.bbox, x: NaN } }, { ...center, bbox: { ...center.bbox, x: -1 } },
  { ...center, bbox: { ...center.bbox, width: 300 } }, { ...center, bbox: { ...center.bbox, confidence: Infinity } },
  { ...center, cropBeforeClip: { ...center.cropBeforeClip, right: 137 } }, { ...edge, cropAfterClip: { ...edge.cropAfterClip, left: -1 } },
  { ...center, roi: { width: 70, height: 72 } }, { ...center, clipped: { ...center.clipped, left: 'false' } },
  { ...edge, clipped: { ...edge.clipped, left: false } }];
for (const value of bad) assert.equal(readPadDiagnostics(value), undefined);
const projected = readPadDiagnostics({ ...center, pixels: 'not allowed', path: 'not allowed', landmarks: [1],
  bbox: { ...center.bbox, raw: 'not allowed' }, frame: { ...center.frame, embedding: [1] } });
assert.deepEqual(projected, center); assert(!JSON.stringify(projected).includes('not allowed'));
console.log('PAD diagnostic contract PASS: center/edge/partial/null, finite/bounds/consistency, allowed-field projection');
