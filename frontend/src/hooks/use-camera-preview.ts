"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthSessionChanged, onStoredAuthCleared } from "@/lib/auth";

export type CameraError = "denied" | "unavailable" | "busy" | "unsupported" | "insecure" | "failed" | "previewFailed" | "interrupted";
export function cameraErrorFrom(error: unknown): CameraError {
  const name = error && typeof error === "object" && "name" in error ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "unavailable";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "busy";
  return "failed";
}

/** Local preview only: no capture, upload, persistence or authentication changes. */
export function useCameraPreview(ownerId: string | null, enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const removeListeners = useRef<(() => void) | null>(null);
  const mounted = useRef(false);
  const eligible = useRef(enabled);
  const generation = useRef(0);
  const requesting = useRef(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<"off" | "requesting" | "on" | "error">("off");
  const [error, setError] = useState<CameraError | null>(null);

  const release = useCallback(() => {
    ++generation.current;
    removeListeners.current?.();
    removeListeners.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
  }, []);

  const stop = useCallback(() => {
    release();
    if (mounted.current) { setStatus("off"); setError(null); }
    // getUserMedia has no cancellation API. Keep the request latch until settled.
  }, [release]);

  useEffect(() => {
    mounted.current = true;
    eligible.current = enabled;
    setStatus("off"); setError(null);
    const stopSession = () => { eligible.current = false; stop(); };
    const offCleared = onStoredAuthCleared(stopSession);
    const offChanged = onAuthSessionChanged(stopSession);
    window.addEventListener("pagehide", stop);
    return () => {
      mounted.current = false;
      eligible.current = false;
      offCleared(); offChanged(); window.removeEventListener("pagehide", stop); release();
    };
  }, [ownerId, enabled, release, stop]);

  const start = useCallback(async () => {
    if (!mounted.current || !eligible.current || requesting.current || streamRef.current) return;
    if (!window.isSecureContext) { setStatus("error"); setError("insecure"); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setStatus("error"); setError("unsupported"); return; }
    requesting.current = true;
    setPending(true); setStatus("requesting"); setError(null);
    const request = ++generation.current;
    const current = () => mounted.current && eligible.current && generation.current === request;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "user" } }, audio: false });
      if (!current()) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      const interrupted = () => {
        if (!current()) return;
        release(); setStatus("error"); setError("interrupted");
      };
      stream.getTracks().forEach(track => track.addEventListener("ended", interrupted));
      removeListeners.current = () => stream.getTracks().forEach(track => track.removeEventListener("ended", interrupted));
      try {
        if (!videoRef.current) throw new Error("Preview unavailable");
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      } catch {
        if (current()) { release(); setStatus("error"); setError("previewFailed"); }
        return;
      }
      if (current()) setStatus("on");
    } catch (failure) {
      if (current()) { release(); setStatus("error"); setError(cameraErrorFrom(failure)); }
    } finally {
      requesting.current = false;
      if (mounted.current) setPending(false);
    }
  }, [release]);

  return { videoRef, status, error, pending, start, stop };
}
