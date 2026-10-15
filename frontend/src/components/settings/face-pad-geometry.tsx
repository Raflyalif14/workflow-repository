"use client";
import { useLanguage } from "@/components/i18n/language-provider";
import { getIntlLocale } from "@/i18n";
import type { PadDiagnostics } from "@/lib/face-pad-diagnostics";

export function FacePadGeometry({ diagnostics: d }: { diagnostics?: PadDiagnostics | null }) {
  const { t } = useLanguage();
  const number = (n: number | null | undefined) => n == null ? "—" : new Intl.NumberFormat(getIntlLocale(), { maximumFractionDigits: 3 }).format(n);
  const bounds = (r: PadDiagnostics["cropBeforeClip"]) => r ? t("facePad.geometryBounds", { left: number(r.left), top: number(r.top), right: number(r.right), bottom: number(r.bottom) }) : "—";
  const edges = (["left", "top", "right", "bottom"] as const).filter(k => d?.clipped?.[k]).map(k => t(`facePad.geometry${k}`));
  if (!d?.frame) return <p className="text-xs text-muted-foreground" data-pad-geometry="unavailable">{t("facePad.geometryUnavailable")}</p>;
  return <section className="min-w-0 space-y-1 border-t pt-2 text-xs [overflow-wrap:anywhere]" data-pad-geometry={d.version} aria-label={t("facePad.geometryTitle")}>
    <p className="font-medium">{t("facePad.geometryTitle")}</p>
    <p>{t("facePad.geometryFrame", { width: d.frame.width, height: d.frame.height })} · {t("facePad.geometryFaces", { count: number(d.faceCount) })}</p>
    <p>{t("facePad.geometryRoi", { width: number(d.roi?.width), height: number(d.roi?.height) })} · {t("facePad.geometryClipping", { edges: d.clipped ? edges.join(", ") || t("facePad.geometryNone") : "—" })}</p>
    <details>
      <summary className="cursor-pointer text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{t("facePad.geometryDetails")}</summary>
      <dl className="space-y-1 pt-2">
        <dt>{t("facePad.geometryBbox")}</dt><dd>{d.bbox ? t("facePad.geometryBboxValue", { x: number(d.bbox.x), y: number(d.bbox.y), width: number(d.bbox.width), height: number(d.bbox.height) }) : "—"}</dd>
        <dt>{t("facePad.geometryConfidence")}</dt><dd>{number(d.bbox?.confidence)}</dd>
        <dt>{t("facePad.geometryBefore")}</dt><dd>{bounds(d.cropBeforeClip)}</dd>
        <dt>{t("facePad.geometryAfter")}</dt><dd>{bounds(d.cropAfterClip)}</dd>
      </dl>
    </details>
    <p className="text-muted-foreground">{t("facePad.geometryLimit")}</p>
  </section>;
}
