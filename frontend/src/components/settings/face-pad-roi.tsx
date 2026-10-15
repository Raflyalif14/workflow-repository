"use client";
import { useLanguage } from "@/components/i18n/language-provider";
import { useFacePadRoi } from "@/hooks/use-face-pad-roi";
import type { PadAttempt, PadSlot } from "@/lib/face-pad";
import type { TemporaryPhoto } from "@/lib/face-photo";

export function FacePadRoi({ owner, eligible, slot, photo, attempt }: {
  owner: string | null; eligible: boolean; slot: PadSlot; photo: TemporaryPhoto | null; attempt: PadAttempt;
}) {
  const { t } = useLanguage(), roi = useFacePadRoi(owner, eligible, slot, photo, attempt);
  return <figure data-pad-roi={roi.status} className="min-w-0 space-y-2 border-t pt-3" aria-label={t("facePad.roiTitle")}>
    <figcaption className="space-y-1 text-xs leading-5">
      <p className="font-medium">{t("facePad.roiTitle")}</p>
      <p className="text-muted-foreground">{t("facePad.roiDescription")}</p>
    </figcaption>
    {roi.status === "ready" && roi.url && roi.width && roi.height ? <>
      <img src={roi.url} width={roi.width} height={roi.height} alt={t("facePad.roiAlt", { slot })}
        className="block h-auto max-w-full rounded-md border" />
      <p className="text-xs text-muted-foreground">{t("facePad.roiSize", { width: roi.width, height: roi.height })}</p>
    </> : <p role="status" className="text-xs text-muted-foreground">{t(roi.status === "loading" ? "facePad.roiLoading" : "facePad.roiUnavailable")}</p>}
    <p className="text-xs leading-5 text-muted-foreground">{t("facePad.roiLimit")}</p>
  </figure>;
}
