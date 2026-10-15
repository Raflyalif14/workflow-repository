"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Camera, CameraOff, LoaderCircle } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCameraPreview } from "@/hooks/use-camera-preview";
import { useFaceDetection } from "@/hooks/use-face-detection";
import { faceCountStatus } from "@/lib/face-detection";
import { useFacePhoto } from "@/hooks/use-face-photo";
import { photoDisabledReason } from "@/lib/face-photo";
import { useFaceComparison } from "@/hooks/use-face-comparison";
import { useFaceExperimentNotes } from "@/hooks/use-face-experiment-notes";
import { FaceExperimentMetadata, FaceExperimentRecords } from "./face-experiment-notes";
import { trialMetadataError } from "@/lib/face-experiment-notes";
import { getIntlLocale } from "@/i18n";
import { FacePadPanel } from "./face-pad-panel";

export function CameraPreparation() {
  const { user, isLoading } = useAuth();
  const { t } = useLanguage();
  const enabled = Boolean(user?.isActive && !user.mustChangePassword && !isLoading);
  const camera = useCameraPreview(user?.id ?? null, enabled);
  const detection = useFaceDetection(camera.videoRef, enabled && camera.status === "on", user?.id ?? null);
  const photoA = useFacePhoto(camera.videoRef, user?.id ?? null, enabled, detection.detectPhoto,
    () => { detection.stop(); camera.stop(); });
  const photoB = useFacePhoto(camera.videoRef, user?.id ?? null, enabled, detection.detectPhoto,
    () => { detection.stop(); camera.stop(); });
  const [slot, setSlot] = useState<"A" | "B">("A");
  const photo = slot === "A" ? photoA : photoB;
  const notes = useFaceExperimentNotes(user?.id ?? null, enabled);
  const comparison = useFaceComparison(user?.id ?? null, enabled, photoA.photo, photoB.photo, notes.metadata);
  const [mirrored, setMirrored] = useState(true);
  const stop = () => {
    if (photoA.status === "capturing") photoA.clear();
    if (photoB.status === "capturing") photoB.clear();
    detection.stop(); camera.stop();
  };
  const reason = photoDisabledReason(camera.status === "on", detection.status === "ready", detection.boxes.length, photo.status === "capturing");
  const start = () => { comparison.cancel(); photo.clear(); void camera.start(); };
  const retake = (target: "A" | "B") => { comparison.cancel(); stop(); (target === "A" ? photoA : photoB).clear(); setSlot(target); void camera.start(); };
  return (
    <div className="container min-w-0 space-y-5 py-6">
      <Link href="/settings" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("nav.settings")}</Link>
      <div className="space-y-2">
        <Badge variant="outline">{t("facePad.stage")}</Badge>
        <h1 className="text-[26px] font-semibold tracking-tight">{t("faceVerification.title")}</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{t("facePad.description")}</p>
        <Link href="/settings/face-verification/quick" target="_blank" rel="noopener noreferrer" className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">{t("faceQuick.openQuick")}</Link>
      </div>
      <Card className="min-w-0 max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Camera className="h-5 w-5 text-primary" aria-hidden="true" />{t("faceVerification.preview")}</CardTitle>
          <CardDescription>{t("facePad.cameraPrivacy")}</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 space-y-4">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            {(["A", "B"] as const).map(target => {
              const own = target === "A" ? photoA : photoB;
              return <section key={target} className={`min-w-0 space-y-2 rounded-lg border p-3 ${slot === target ? "border-primary bg-primary/5" : "border-border"}`}>
                <Button variant="outline" aria-pressed={slot === target} onClick={() => { stop(); setSlot(target); }} className="w-full">{t(`faceCompare.photo${target}`)}</Button>
                {own.photo ? <img data-face-slot={target} src={own.photo.url} alt={t(`faceCompare.photo${target}`)}
                  className={`h-28 w-full rounded-md object-contain ${mirrored ? "-scale-x-100" : ""}`} /> : <p className="text-sm text-muted-foreground">{t("faceCompare.empty")}</p>}
                {own.photo && <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => retake(target)} disabled={camera.pending}>{t("facePhoto.retake")}</Button>
                  <Button variant="outline" size="sm" onClick={() => { comparison.cancel(); own.clear(); }}>{t("facePhoto.delete")}</Button>
                </div>}
              </section>;
            })}
          </div>
          <p className="text-sm font-medium">{t("faceCompare.current", { slot })}</p>
          <div className={`relative aspect-video w-full min-w-0 overflow-hidden rounded-xl border border-border bg-muted ${photo.photo ? "hidden" : ""}`}>
            <video ref={camera.videoRef} autoPlay muted playsInline aria-label={t("faceVerification.preview")}
              className={`h-full w-full object-contain ${mirrored ? "-scale-x-100" : ""}`} />
            {camera.status === "on" && detection.status === "ready" && <svg
              data-face-overlay="true" aria-hidden="true" viewBox={`0 0 ${detection.width} ${detection.height}`}
              preserveAspectRatio="xMidYMid meet"
              className={`pointer-events-none absolute inset-0 h-full w-full ${mirrored ? "-scale-x-100" : ""}`}>
              {detection.boxes.map((box, index) => <rect key={index} x={box.x} y={box.y}
                width={box.width} height={box.height} fill="none" stroke="#2563eb" strokeWidth="3"
                vectorEffect="non-scaling-stroke" rx="4" />)}
            </svg>}
            {camera.status !== "on" && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted px-4 text-center text-sm text-muted-foreground">
              {camera.pending ? <LoaderCircle className="h-7 w-7 animate-spin text-primary" aria-hidden="true" /> : <CameraOff className="h-7 w-7" aria-hidden="true" />}
              <span>{t(camera.pending ? "faceVerification.requesting" : "faceVerification.off")}</span>
            </div>}
          </div>
          {!photo.photo && <p role="status" aria-live="polite" className="text-sm font-medium text-foreground">
            {t(camera.status === "on" ? "faceVerification.on" : camera.pending ? "faceVerification.requesting" : "faceVerification.off")}
          </p>}
          {camera.status === "on" && <div className="space-y-2">
            <p role={detection.status === "error" ? "alert" : "status"} aria-live="polite"
              data-face-status={detection.status} data-face-count={detection.boxes.length}
              className={`text-sm font-medium ${detection.status === "error" ? "text-destructive" : "text-foreground"}`}>
              {t(detection.status === "error" ? "faceDetection.failed" : detection.status !== "ready"
                ? "faceDetection.loading" : `faceDetection.${faceCountStatus(detection.boxes.length)}`)}
            </p>
            {detection.status === "error" && <Button variant="outline" onClick={detection.retry}>{t("faceDetection.retry")}</Button>}
          </div>}
          {camera.error && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{t(`faceVerification.${camera.error}`)}</p>}
          {photo.error && <p role="alert" data-photo-error={photo.error} className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{t(`facePhoto.${photo.error}`)}</p>}
          {!photo.photo && <div className="space-y-2">
            <Button onClick={() => void photo.capture()} disabled={!enabled || reason !== null}
              aria-describedby={reason ? "photo-capture-reason" : undefined} className="gap-2">
              {photo.status === "capturing" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
              {t("facePhoto.capture")}
            </Button>
            {reason && <p id="photo-capture-reason" role="status" className="text-xs leading-5 text-muted-foreground">{t(`facePhoto.${reason}`)}</p>}
          </div>}
          {photo.photo && <section aria-label={t("facePhoto.result")} data-photo-preview="true" className="space-y-3">
            <p role="status" className="text-sm font-medium">{t("facePhoto.ready")}</p>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <figure className="min-w-0 space-y-2">
                <img src={photo.photo.url} alt={t("facePhoto.fullAlt")} data-photo-image="full"
                  className={`max-h-80 w-full rounded-lg border object-contain ${mirrored ? "-scale-x-100" : ""}`} />
                <figcaption className="text-xs text-muted-foreground">{t("facePhoto.full")}</figcaption>
              </figure>
              <figure className="min-w-0 space-y-2">
                <img src={photo.photo.cropUrl} alt={t("facePhoto.cropAlt")} data-photo-image="crop"
                  className={`max-h-80 w-full rounded-lg border object-contain ${mirrored ? "-scale-x-100" : ""}`} />
                <figcaption className="text-xs text-muted-foreground">{t("facePhoto.crop")}</figcaption>
              </figure>
            </div>
          </section>}
          {!photo.photo && <div className="flex flex-wrap gap-3">
            <Button onClick={start} disabled={!enabled || camera.pending || camera.status === "on" || photo.status === "capturing" || !!photo.photo} className="gap-2">
              <Camera className="h-4 w-4" aria-hidden="true" />{t("faceVerification.start")}
            </Button>
            <Button variant="outline" onClick={stop} disabled={camera.status !== "on" && camera.status !== "requesting" && photo.status !== "capturing"} className="gap-2">
              <CameraOff className="h-4 w-4" aria-hidden="true" />{t("faceVerification.stop")}
            </Button>
          </div>}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={mirrored} onChange={event => setMirrored(event.target.checked)}
              className="h-4 w-4 shrink-0 accent-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" />
            {t("faceDetection.mirror")}
          </label>
          <FaceExperimentMetadata notes={notes} eligible={enabled} />
          <section aria-label={t("faceCompare.title")} className="space-y-3 rounded-lg border p-3">
            <h2 className="font-semibold">{t("faceCompare.title")}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{t("faceCompare.disclosure")}</p>
            <label className="flex items-start gap-2 text-sm leading-5">
              <input type="checkbox" checked={comparison.consent} disabled={comparison.busy}
                onChange={e => comparison.setConsent(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-blue-600" />
              {t("faceCompare.consent")}
            </label>
            {comparison.availability !== "enabled" && <p role="status" className="text-sm text-muted-foreground">{t(`faceCompare.${comparison.availability}`)}</p>}
            {(comparison.availability === "error" || comparison.availability === "disabled") && <Button variant="outline" onClick={comparison.retryAvailability}>{t("common.retry")}</Button>}
            {(!photoA.photo || !photoB.photo) && <p className="text-sm text-muted-foreground">{t("faceCompare.bothRequired")}</p>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void comparison.compare()} disabled={!enabled || !photoA.photo || !photoB.photo || !comparison.consent || comparison.busy || comparison.availability !== "enabled" || !!trialMetadataError(notes.metadata)}>{t(comparison.busy ? "faceCompare.comparing" : "faceCompare.compare")}</Button>
              {comparison.busy && <Button variant="outline" onClick={comparison.cancel}>{t("faceCompare.cancel")}</Button>}
            </div>
            {comparison.error && <p role="alert" className="text-sm text-destructive">{t(`faceCompare.${comparison.error as "FACE_TIMEOUT"}`)}</p>}
            {comparison.result && <div role="status" data-comparison-result="true" className="space-y-1">
              <p className="text-sm font-medium">{t("faceCompare.score")}: {new Intl.NumberFormat(getIntlLocale(), { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(comparison.result.score)}</p>
              <p className="text-xs text-muted-foreground">{t("faceCompare.scale")}</p>
            </div>}
            <p className="text-xs leading-5 text-muted-foreground">{t("faceCompare.disclaimer")}</p>
          </section>
          <p className="text-xs leading-5 text-muted-foreground">{t("faceVerification.help")}</p>
        </CardContent>
      </Card>
      <FaceExperimentRecords notes={notes} completed={comparison.completed} eligible={enabled} />
      <FacePadPanel owner={user?.id ?? null} eligible={enabled} a={photoA.photo} b={photoB.photo} />
    </div>
  );
}
