const HASH = 'c4c99af04603b62d7e44f6f4daeb33e0daeccc696008c0b1d62f6f5cebbb3262';
export type CaptureAnalysis = {
  schemaVersion: 'pad-capture-analysis-v1'; status: 'SUCCESS'; prediction: null;
  imageSha256: string; modelSha256: string; frame: { width: number; height: number };
  decoderMaxDifference: number; preprocessingMaxDifference: number;
  brightnessMean: number; contrastStd: number; laplacianVariance: number;
  cropResults: { id: 'CURRENT' | 'REFERENCE_RECT' | 'FACE_BOX'; rect: { left: number; top: number; right: number; bottom: number };
    opencv: { real: number; spoof: number }; onnx: { real: number; spoof: number };
    maxDifference: number; runtimeMatches: boolean; deterministic: boolean }[];
};
const finite = (n: any) => typeof n === 'number' && Number.isFinite(n);
const probability = (p: any) => p && [p.real, p.spoof].every(n => finite(n) && n >= 0 && n <= 1) && Math.abs(p.real + p.spoof - 1) <= 1e-5;
export function readCaptureAnalysis(v: any): CaptureAnalysis | null {
  const f = v?.frame;
  if (v?.schemaVersion !== 'pad-capture-analysis-v1' || v.status !== 'SUCCESS' || v.prediction !== null
    || v.modelSha256 !== HASH || !/^[0-9a-f]{64}$/.test(v.imageSha256)
    || !f || ![f.width, f.height].every(n => Number.isInteger(n) && n >= 128 && n <= 4096) || f.width * f.height > 8000000
    || !Number.isInteger(v.decoderMaxDifference) || v.decoderMaxDifference < 0 || v.decoderMaxDifference > 255
    || !finite(v.preprocessingMaxDifference) || v.preprocessingMaxDifference < 0
    || ![v.brightnessMean, v.contrastStd].every(n => finite(n) && n >= 0 && n <= 255)
    || !finite(v.laplacianVariance) || v.laplacianVariance < 0
    || !Array.isArray(v.cropResults) || v.cropResults.length !== 3) return null;
  const rows: CaptureAnalysis['cropResults'] = [];
  const ids = ['CURRENT', 'REFERENCE_RECT', 'FACE_BOX'];
  for (let i = 0; i < 3; i++) {
    const row = v.cropResults[i], r = row?.rect;
    if (row?.id !== ids[i] || !r || ![r.left, r.top, r.right, r.bottom].every(Number.isInteger)
      || r.left < 0 || r.top < 0 || r.right > f.width || r.bottom > f.height || r.right - r.left < 2 || r.bottom - r.top < 2
      || !probability(row.opencv) || !probability(row.onnx) || !finite(row.maxDifference) || row.maxDifference < 0 || row.maxDifference > 1
      || typeof row.runtimeMatches !== 'boolean' || typeof row.deterministic !== 'boolean') return null;
    const differences = [Math.abs(row.opencv.real - row.onnx.real), Math.abs(row.opencv.spoof - row.onnx.spoof)];
    const matches = differences.every((value, index) => value <= 1e-5 + 1e-4 * (index === 0 ? row.onnx.real : row.onnx.spoof));
    if (row.runtimeMatches !== matches || row.maxDifference + 1e-12 < Math.max(...differences)) return null;
    rows.push({ id: row.id, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      opencv: { real: row.opencv.real, spoof: row.opencv.spoof }, onnx: { real: row.onnx.real, spoof: row.onnx.spoof },
      maxDifference: row.maxDifference, runtimeMatches: row.runtimeMatches, deterministic: row.deterministic });
  }
  return { schemaVersion: v.schemaVersion, status: 'SUCCESS', prediction: null, imageSha256: v.imageSha256, modelSha256: v.modelSha256,
    frame: { width: f.width, height: f.height }, decoderMaxDifference: v.decoderMaxDifference,
    preprocessingMaxDifference: v.preprocessingMaxDifference, brightnessMean: v.brightnessMean, contrastStd: v.contrastStd,
    laplacianVariance: v.laplacianVariance, cropResults: rows };
}
