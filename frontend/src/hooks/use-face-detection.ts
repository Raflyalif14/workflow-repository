"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { onAuthSessionChanged, onStoredAuthCleared } from "@/lib/auth";
import { EMPTY_DETECTION, startFaceDetection, type FaceDetectionController } from "@/lib/face-detection";

export function useFaceDetection(video: RefObject<HTMLVideoElement | null>, active: boolean, ownerId: string | null) {
  const [state, setState] = useState(EMPTY_DETECTION);
  const [attempt, setAttempt] = useState(0);
  const release = useRef<FaceDetectionController | null>(null);
  const stop = useCallback(() => { release.current?.(); release.current = null; setState(EMPTY_DETECTION); }, []);
  useEffect(() => {
    setState(EMPTY_DETECTION);
    if (!active || !video.current) return;
    release.current = startFaceDetection({ video: video.current, publish: setState });
    const offCleared = onStoredAuthCleared(stop), offChanged = onAuthSessionChanged(stop);
    window.addEventListener("pagehide", stop);
    return () => {
      release.current?.(); release.current = null;
      offCleared(); offChanged(); window.removeEventListener("pagehide", stop);
    };
  }, [active, ownerId, attempt, stop, video]);
  const retry = useCallback(() => { stop(); setAttempt(n => n + 1); }, [stop]);
  const detectPhoto = useCallback(async (canvas: HTMLCanvasElement) => {
    const controller = release.current;
    if (!controller) throw new Error("Detector unavailable");
    const bitmap = await createImageBitmap(canvas); // No resize: crop uses original video coordinates.
    if (release.current !== controller) { bitmap.close(); throw new Error("Detection cancelled"); }
    return controller.detectPhoto(bitmap);
  }, []);
  return { ...state, stop, retry, detectPhoto };
}
