"use client";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowLeft, Camera, CameraOff, CheckCircle2, LoaderCircle } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCameraPreview } from "@/hooks/use-camera-preview";
import { useFaceDetection } from "@/hooks/use-face-detection";
import { useFacePhoto } from "@/hooks/use-face-photo";
import { useQuickFaceTest } from "@/hooks/use-quick-face-test";
import { useFacePadRoi } from "@/hooks/use-face-pad-roi";
import { faceCountStatus } from "@/lib/face-detection";
import { photoDisabledReason, type TemporaryPhoto } from "@/lib/face-photo";
import type { PadResult } from "@/lib/face-pad";
import { getIntlLocale } from "@/i18n";
import { QuickFaceDiagnosis } from "./quick-face-diagnosis";
import { FaceCandidateTest } from "./face-candidate-test";

export function QuickFaceResult({ owner, eligible, photo, result }: {
  owner: string; eligible: boolean; photo: TemporaryPhoto; result: PadResult;
}) {
  const { t } = useLanguage();
  const attempt = useMemo(() => ({ id: result.requestId, slot: result.slot, status: "SUCCESS" as const, reason: null, result }), [result]);
  const roi = useFacePadRoi(owner, eligible, result.slot, photo, attempt);
  const d = result.diagnostics;
  const percent = (value: number) => new Intl.NumberFormat(getIntlLocale(), { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  return <section data-quick-result="success" aria-label={t("faceQuick.result")} className="space-y-4 rounded-xl border p-4">
    <div role="status" aria-live="polite">
      <h2 className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />{t("faceQuick.completed")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("faceQuick.inconclusive")}</p>
    </div>
    <ul className="space-y-2 text-sm">
      <li>{t(d?.faceCount === 1 ? "faceQuick.faceOk" : "faceQuick.faceUnknown")}</li>
      <li>{t(roi.status === "ready" ? "faceQuick.cropOk" : roi.status === "loading" ? "faceQuick.cropLoading" : "faceQuick.cropUnknown")}</li>
      <li>{t("faceQuick.modelOk")}</li>
    </ul>
    <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted p-3 text-sm">
      <div><dt>{t("facePad.real")}</dt><dd className="text-xl font-semibold tabular-nums">{percent(result.probabilities.real)}</dd></div>
      <div><dt>{t("facePad.spoof")}</dt><dd className="text-xl font-semibold tabular-nums">{percent(result.probabilities.spoof)}</dd></div>
    </dl>
    <p className="text-sm leading-6">{t(result.probabilities.spoof > result.probabilities.real ? "faceQuick.spoofHigher" : "faceQuick.scoreHelp")}</p>
    {roi.status === "ready" && roi.url && <figure className="space-y-2">
      <img src={roi.url} width={roi.width!} height={roi.height!} alt={t("faceQuick.cropAlt")} className="h-auto max-h-64 max-w-full rounded-lg border object-contain" />
      <figcaption className="text-xs text-muted-foreground">{t("faceQuick.cropCaption")}</figcaption>
    </figure>}
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer py-1 text-primary">{t("faceQuick.details")}</summary>
      <dl className="mt-2 space-y-1 break-words">
        <div><dt>{t("faceNotes.model")}</dt><dd>{result.provenance.model}</dd></div>
        <div><dt>{t("facePad.real")}</dt><dd>{String(result.probabilities.real)}</dd></div>
        <div><dt>{t("facePad.spoof")}</dt><dd>{String(result.probabilities.spoof)}</dd></div>
        {d?.roi && <div><dt>{t("faceQuick.cropSize")}</dt><dd>{d.roi.width} × {d.roi.height} px</dd></div>}
      </dl>
    </details>
    <FaceCandidateTest owner={owner} eligible={eligible} photo={photo} result={result} />
    <details><summary className="cursor-pointer text-xs text-primary">{t("faceQuick.analysisTitle")}</summary>
      <QuickFaceDiagnosis owner={owner} eligible={eligible} photo={photo} result={result} />
    </details>
  </section>;
}

export function QuickFaceTest() {
  const { user, isLoading } = useAuth(), { t } = useLanguage();
  const owner = user?.id ?? null, eligible = Boolean(user?.isActive && !user.mustChangePassword && !isLoading);
  const camera = useCameraPreview(owner, eligible);
  const detection = useFaceDetection(camera.videoRef, eligible && camera.status === "on", owner);
  const photo = useFacePhoto(camera.videoRef, owner, eligible, detection.detectPhoto, () => { detection.stop(); camera.stop(); });
  const test = useQuickFaceTest(owner, eligible, photo.photo);
  const reason = photoDisabledReason(camera.status === "on", detection.status === "ready", detection.boxes.length, photo.status === "capturing");
  const stop = () => { if (photo.status === "capturing") photo.clear(); detection.stop(); camera.stop(); };
  const retake = () => { test.cancel(); stop(); photo.clear(); void camera.start(); };
  return <div className="container min-w-0 max-w-3xl space-y-5 py-6" data-quick-face-test="true">
    <Link href="/settings" className="inline-flex items-center gap-2 text-sm text-primary hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("nav.settings")}</Link>
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold">{t("faceQuick.title")}</h1>
      <p className="text-sm leading-6 text-muted-foreground">{t("faceQuick.description")}</p>
    </header>
    <ol className="grid gap-2 text-sm sm:grid-cols-3">
      {(["stepCamera", "stepPhoto", "stepTest"] as const).map((key, index) => <li key={key} className="rounded-lg border p-3"><span className="mr-2 font-semibold text-primary">{index + 1}.</span>{t(`faceQuick.${key}`)}</li>)}
    </ol>
    <Card className="min-w-0">
      <CardHeader><CardTitle className="text-base">{t("faceQuick.photoTitle")}</CardTitle></CardHeader>
      <CardContent className="min-w-0 space-y-4">
        <div className={`relative aspect-[4/3] max-h-72 w-full overflow-hidden rounded-xl bg-muted ${photo.photo ? "hidden" : ""}`}>
          <video ref={camera.videoRef} autoPlay muted playsInline aria-label={t("faceVerification.preview")} className="h-full w-full -scale-x-100 object-contain" />
          {camera.status === "on" && detection.status === "ready" && <svg aria-hidden="true" viewBox={`0 0 ${detection.width} ${detection.height}`} preserveAspectRatio="xMidYMid meet" className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100">
            {detection.boxes.map((box, index) => <rect key={index} x={box.x} y={box.y} width={box.width} height={box.height} fill="none" stroke="#2563eb" strokeWidth="3" vectorEffect="non-scaling-stroke" />)}
          </svg>}
          {camera.status !== "on" && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
            {camera.pending ? <LoaderCircle className="h-7 w-7 animate-spin" aria-hidden="true" /> : <CameraOff className="h-7 w-7" aria-hidden="true" />}
            {t(camera.pending ? "faceVerification.requesting" : "faceVerification.off")}
          </div>}
        </div>
        {photo.photo && <img src={photo.photo.url} alt={t("faceQuick.photoAlt")} className="max-h-72 w-full rounded-xl border object-contain" />}
        {camera.error && <p role="alert" className="text-sm text-destructive">{t(`faceVerification.${camera.error}`)}</p>}
        {photo.error && <p role="alert" className="text-sm text-destructive">{t(`facePhoto.${photo.error}`)}</p>}
        {camera.status === "on" && <p role="status" className="text-sm">{t(detection.status === "error" ? "faceDetection.failed" : detection.status !== "ready" ? "faceDetection.loading" : `faceDetection.${faceCountStatus(detection.boxes.length)}`)}</p>}
        {camera.status === "on" && detection.status === "error" && <Button variant="outline" onClick={detection.retry}>{t("faceDetection.retry")}</Button>}
        <div className="flex flex-wrap gap-2">
          {photo.photo ? <>
            <Button variant="outline" onClick={retake} disabled={!eligible || camera.pending}>{t("facePhoto.retake")}</Button>
            <Button variant="outline" onClick={() => { test.cancel(); photo.clear(); }}>{t("facePhoto.delete")}</Button>
          </> : <>
            <Button onClick={() => void camera.start()} disabled={!eligible || camera.pending || camera.status === "on" || photo.status === "capturing"}><Camera className="mr-2 h-4 w-4" aria-hidden="true" />{t("faceVerification.start")}</Button>
            <Button onClick={() => void photo.capture()} disabled={!eligible || reason !== null} aria-describedby="quick-capture-help">{t(photo.status === "capturing" ? "facePhoto.capturing" : "facePhoto.capture")}</Button>
            {(camera.status === "on" || camera.pending) && <Button variant="outline" onClick={stop}>{t("faceVerification.stop")}</Button>}
          </>}
        </div>
        {!photo.photo && reason && <p id="quick-capture-help" className="text-xs text-muted-foreground">{t(`facePhoto.${reason}`)}</p>}
        {photo.photo && <div className="space-y-3 border-t pt-4">
          <p id="quick-face-privacy" className="text-sm leading-6 text-muted-foreground">{t("faceQuick.privacy")}</p>
          <Button onClick={() => void test.run()} disabled={!eligible || test.busy || test.availability !== "enabled"} aria-describedby="quick-face-privacy" className="w-full gap-2 sm:w-auto">
            {test.busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}{t(test.busy ? "faceQuick.testing" : "faceQuick.test")}
          </Button>
          {test.busy && <Button variant="outline" onClick={test.cancel} className="ml-2">{t("common.cancel")}</Button>}
        </div>}
        {test.availability !== "enabled" && <p role="status" className="text-sm text-muted-foreground">{t(`facePad.${test.availability}`)}</p>}
        {(test.availability === "error" || test.availability === "disabled") && <Button variant="outline" onClick={test.retry}>{t("common.retry")}</Button>}
        {test.outcome?.status === "ERROR" && <section role="alert" data-quick-result="error" className="space-y-1 rounded-lg border border-destructive/30 p-3 text-sm">
          <h2 className="font-semibold">{t("faceQuick.problem")}</h2><p>{t(`facePad.${test.outcome.reason}`)}</p><p className="text-muted-foreground">{t("faceQuick.noResult")}</p>
        </section>}
        {test.outcome?.status === "SUCCESS" && photo.photo && owner && <QuickFaceResult owner={owner} eligible={eligible} photo={photo.photo} result={test.outcome.result} />}
        <p className="text-xs leading-5 text-muted-foreground">{t("faceQuick.retention")}</p>
      </CardContent>
    </Card>
    <Link href="/settings/face-verification/advanced" className="inline-block text-sm text-primary hover:underline">{t("faceQuick.advanced")}</Link>
  </div>;
}
