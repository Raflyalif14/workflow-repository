/** Geometry only. Null means not obtained; undefined means an invalid contract. */
export type PadDiagnostics = {
  version: 'pad-geometry-v1';
  frame: { width: number; height: number } | null;
  faceCount: number | null;
  bbox: { x: number; y: number; width: number; height: number; confidence: number | null } | null;
  cropBeforeClip: { left: number; top: number; right: number; bottom: number } | null;
  cropAfterClip: { left: number; top: number; right: number; bottom: number } | null;
  roi: { width: number; height: number } | null;
  clipped: { left: boolean; top: boolean; right: boolean; bottom: boolean } | null;
};
const object = (v: any) => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (n: any): n is number => typeof n === 'number' && Number.isFinite(n);
const integer = (n: any): n is number => finite(n) && Number.isInteger(n);
export function readPadDiagnostics(value: unknown): PadDiagnostics | null | undefined {
  if (value == null) return null; // Compatibility: old responses/rows have no diagnostics.
  const d = value as PadDiagnostics;
  if (!object(d) || d.version !== 'pad-geometry-v1') return undefined;
  const { frame: f, faceCount: count, bbox: b, cropBeforeClip: before, cropAfterClip: after, roi, clipped } = d;
  if (f !== null && (!object(f) || !integer(f.width) || !integer(f.height) || Math.min(f.width, f.height) < 128 || Math.max(f.width, f.height) > 4096 || f.width * f.height > 8000000)) return undefined;
  if (count !== null && (!integer(count) || count < 0 || count > 5000 || !f)) return undefined;
  if (b !== null && (!f || count !== 1 || !object(b) || ![b.x, b.y, b.width, b.height].every(finite)
    || b.x < 0 || b.y < 0 || b.width <= 0 || b.height <= 0 || b.x + b.width > f.width || b.y + b.height > f.height
    || b.confidence !== null && (!finite(b.confidence) || b.confidence < 0 || b.confidence > 1))) return undefined;
  const rect = (r: any) => object(r) && [r.left, r.top, r.right, r.bottom].every(integer) && r.right > r.left && r.bottom > r.top;
  if (before !== null) {
    if (!f || !b || !rect(before)) return undefined;
    const side = Math.max(b.width, b.height) * 1.2, cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    if (before.left !== Math.floor(cx - side / 2) || before.top !== Math.floor(cy - side / 2)
      || before.right !== Math.ceil(cx + side / 2) || before.bottom !== Math.ceil(cy + side / 2)) return undefined;
  }
  if (after !== null && (!f || !before || !rect(after) || after.left !== Math.max(0, before.left) || after.top !== Math.max(0, before.top)
    || after.right !== Math.min(f.width, before.right) || after.bottom !== Math.min(f.height, before.bottom))) return undefined;
  if (roi !== null && (!after || !object(roi) || !integer(roi.width) || !integer(roi.height) || roi.width < 2 || roi.height < 2
    || roi.width !== after.right - after.left || roi.height !== after.bottom - after.top)) return undefined;
  if (clipped !== null && (!before || !after || !object(clipped) || !['left','top','right','bottom'].every(k => typeof (clipped as any)[k] === 'boolean')
    || clipped.left !== (before.left !== after.left) || clipped.top !== (before.top !== after.top)
    || clipped.right !== (before.right !== after.right) || clipped.bottom !== (before.bottom !== after.bottom))) return undefined;
  return { version: 'pad-geometry-v1', frame: f ? { width: f.width, height: f.height } : null, faceCount: count,
    bbox: b ? { x: b.x, y: b.y, width: b.width, height: b.height, confidence: b.confidence } : null,
    cropBeforeClip: before ? { left: before.left, top: before.top, right: before.right, bottom: before.bottom } : null,
    cropAfterClip: after ? { left: after.left, top: after.top, right: after.right, bottom: after.bottom } : null,
    roi: roi ? { width: roi.width, height: roi.height } : null,
    clipped: clipped ? { left: clipped.left, top: clipped.top, right: clipped.right, bottom: clipped.bottom } : null };
}
export const completePadDiagnostics = (d: PadDiagnostics | null) => !!(d?.frame && d.faceCount === 1 && d.bbox && d.cropBeforeClip && d.cropAfterClip && d.roi && d.clipped);
