export type CandidateResult = {
  status: 'SUCCESS'; prediction: null; imageSha256: string; frame: { width: number; height: number };
  baseline: { real: number; spoof: number }; durationMs: number;
  candidate: { version: 'minifas-yunet-native-v1'; probabilities: { real: number; spoof: number };
    models: { model: string; sha256: string; onnxSha256: string; scale: number; classes: number[];
      rect: { left: number; top: number; right: number; bottom: number } }[] };
};
const models = [
  ['MiniFASNetV2', 'a5eb02e1843f19b5386b953cc4c9f011c3f985d0ee2bb9819eea9a142099bec0', 2.7, '2e4d897d506d2265ae3bf8c092002a527b2e78d940f8c60223a4ee03b7b65e11'],
  ['MiniFASNetV1SE', '84ee1d37d96894d5e82de5a57df044ef80a58be2b218b5ed7cdfd875ec2f5990', 4, '6e4baab0c157a97f274f69bbd2bc3cf773c2ccd635a613930963963669dc3af5'],
] as const;
const finite = (n: any) => typeof n === 'number' && Number.isFinite(n);
const probability = (p: any) => p && [p.real, p.spoof].every(n => finite(n) && n >= 0 && n <= 1) && Math.abs(p.real + p.spoof - 1) <= 1e-5;
export function readCandidateResult(v: any): CandidateResult | null {
  const f = v?.frame, candidate = v?.candidate;
  if (v?.status !== 'SUCCESS' || v.prediction !== null || !/^[0-9a-f]{64}$/.test(v.imageSha256)
    || !f || ![f.width, f.height].every(n => Number.isInteger(n) && n >= 128 && n <= 4096) || f.width * f.height > 8000000
    || !finite(v.durationMs) || v.durationMs < 0 || !probability(v.baseline)
    || candidate?.version !== 'minifas-yunet-native-v1' || !probability(candidate.probabilities)
    || !Array.isArray(candidate.models) || candidate.models.length !== 2) return null;
  const rows: CandidateResult['candidate']['models'] = [];
  for (let i = 0; i < 2; i++) {
    const row = candidate.models[i], r = row?.rect, expected = models[i];
    if (row?.model !== expected[0] || row.sha256 !== expected[1] || row.scale !== expected[2] || row.onnxSha256 !== expected[3]
      || !Array.isArray(row.classes) || row.classes.length !== 3 || !row.classes.every((n: number) => finite(n) && n >= 0 && n <= 1)
      || Math.abs(row.classes.reduce((a: number, b: number) => a+b, 0) - 1) > 1e-5
      || !r || ![r.left, r.top, r.right, r.bottom].every(Number.isInteger)
      || r.left < 0 || r.top < 0 || r.right > f.width || r.bottom > f.height || r.right-r.left < 2 || r.bottom-r.top < 2) return null;
    rows.push({ model: row.model, sha256: row.sha256, onnxSha256: row.onnxSha256, scale: row.scale, classes: [...row.classes],
      rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } });
  }
  const real = (rows[0].classes[1] + rows[1].classes[1])/2;
  const spoof = (rows[0].classes[0] + rows[0].classes[2] + rows[1].classes[0] + rows[1].classes[2])/2;
  if (Math.abs(real-candidate.probabilities.real) > 1e-7 || Math.abs(spoof-candidate.probabilities.spoof) > 1e-7) return null;
  return { status: 'SUCCESS', prediction: null, imageSha256: v.imageSha256, frame: { width: f.width, height: f.height },
    baseline: { real: v.baseline.real, spoof: v.baseline.spoof }, durationMs: v.durationMs,
    candidate: { version: candidate.version, probabilities: { real, spoof }, models: rows } };
}
