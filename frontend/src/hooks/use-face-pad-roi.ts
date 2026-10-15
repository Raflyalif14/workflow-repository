"use client";
import { useEffect, useRef, useState } from "react";
import { onAuthSessionChanged, onStoredAuthCleared } from "@/lib/auth";
import type { TemporaryPhoto } from "@/lib/face-photo";
import type { PadSlot } from "@/lib/face-pad";
import { createPadRoiPreview, EMPTY_PAD_ROI, type PadRoiState, type PadRoiAttempt } from "@/lib/face-pad-roi";

export function useFacePadRoi(owner: string | null, eligible: boolean, slot: PadSlot, photo: TemporaryPhoto | null, attempt: PadRoiAttempt) {
  const latest = useRef({ owner, eligible, slot, photo, attempt }); latest.current = { owner, eligible, slot, photo, attempt };
  const [saved, setSaved] = useState<{ owner: string; photo: TemporaryPhoto; attempt: PadRoiAttempt; state: PadRoiState } | null>(null);
  useEffect(() => {
    setSaved(null);
    if (!owner || !eligible || !photo) return;
    let alive = true;
    const current = () => alive && latest.current.owner === owner && latest.current.eligible && latest.current.slot === slot
      && latest.current.photo === photo && latest.current.attempt === attempt;
    const controller = createPadRoiPreview({ publish: state => { if (current()) setSaved({ owner, photo, attempt, state }); } });
    const invalidate = () => { alive = false; controller.dispose(); setSaved(null); };
    const offClear = onStoredAuthCleared(invalidate), offChange = onAuthSessionChanged(invalidate);
    window.addEventListener("pagehide", invalidate);
    void controller.preview({ owner, slot, photo, attempt }, current);
    return () => { alive = false; controller.dispose(); offClear(); offChange(); window.removeEventListener("pagehide", invalidate); };
  }, [owner, eligible, slot, photo, attempt]);
  // Avoid painting a previous photo/account/request before effect cleanup runs.
  return eligible && owner && saved?.owner === owner && saved.photo === photo && saved.attempt === attempt ? saved.state : EMPTY_PAD_ROI;
}
