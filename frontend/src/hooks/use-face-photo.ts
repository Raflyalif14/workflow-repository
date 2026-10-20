"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { onAuthSessionChanged, onStoredAuthCleared } from "@/lib/auth";
import type { FrameDetection } from "@/lib/face-detection";
import { createPhotoCapture, EMPTY_PHOTO } from "@/lib/face-photo";

export function useFacePhoto(video: RefObject<HTMLVideoElement | null>, ownerId: string | null, eligible: boolean,
  detect: (frame: HTMLCanvasElement) => Promise<FrameDetection>, validated: () => void) {
  const [state, setState] = useState(EMPTY_PHOTO);
  const actions = useRef({ detect, validated }); actions.current = { detect, validated };
  const controller = useRef<ReturnType<typeof createPhotoCapture> | null>(null);
  const boundOwner = useRef<string | null>(null);
  const clear = useCallback(() => controller.current?.clear(), []);
  useEffect(() => {
    setState(EMPTY_PHOTO);
    if (!eligible || !ownerId) return;
    const own = createPhotoCapture({ detect: frame => actions.current.detect(frame),
      validated: () => actions.current.validated(), publish: setState });
    controller.current = own;
    boundOwner.current = ownerId;
    const invalidate = () => { own.dispose(); controller.current = null; boundOwner.current = null; setState(EMPTY_PHOTO); };
    const offClear = onStoredAuthCleared(invalidate), offChange = onAuthSessionChanged(invalidate);
    window.addEventListener("pagehide", invalidate);
    return () => { own.dispose(); controller.current = null; boundOwner.current = null; offClear(); offChange(); window.removeEventListener("pagehide", invalidate); };
  }, [ownerId, eligible]);
  const capture = useCallback(() => {
    if (eligible && boundOwner.current === ownerId && video.current) return controller.current?.capture(video.current);
  }, [video, ownerId, eligible]);
  // Never paint the previous actor's photo during the render preceding effect cleanup.
  const visible = eligible && boundOwner.current === ownerId ? state : EMPTY_PHOTO;
  return { ...visible, capture, clear };
}
