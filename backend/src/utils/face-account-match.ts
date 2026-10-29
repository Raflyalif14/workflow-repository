// Same SFace cosine cutoff as the camera login worker. This is a match rule, not identity certainty.
export function matchesRegisteredFace(a: number[], b: number[]) {
  if (a.length !== 128 || b.length !== 128 || !a.every(Number.isFinite) || !b.every(Number.isFinite)) throw Error('FACE_PROCESS_FAILED');
  const normA = Math.hypot(...a), normB = Math.hypot(...b);
  if (normA < 1e-8 || normB < 1e-8) throw Error('FACE_PROCESS_FAILED');
  return a.reduce((sum, value, i) => sum + value * b[i], 0) / (normA * normB) >= .60;
}
