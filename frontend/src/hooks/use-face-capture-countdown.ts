"use client";
import { useEffect, useRef, useState } from 'react';

/** UI pacing only. The server still checks all three poses, identity and PAD. */
export function useFaceCaptureCountdown(active: boolean, step: number, capture: () => void) {
  const [seconds, setSeconds] = useState(3), [paused, setPaused] = useState(false);
  const latest = useRef(capture);
  useEffect(() => { latest.current = capture; });
  useEffect(() => {
    setSeconds(3); setPaused(false);
    if (!active) return;
    let stopped = false, remaining = 3, timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      if (stopped) return;
      if (document.visibilityState === 'hidden') { restart(); return; }
      remaining -= 1; setSeconds(remaining);
      if (remaining === 0) latest.current();
      else timer = setTimeout(tick, 1000);
    };
    const restart = () => {
      clearTimeout(timer);
      if (stopped) return;
      remaining = 3; setSeconds(3);
      const hidden = document.visibilityState === 'hidden'; setPaused(hidden);
      if (!hidden) timer = setTimeout(tick, 1000);
    };
    document.addEventListener('visibilitychange', restart);
    restart();
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', restart); };
  }, [active, step]);
  return { seconds, paused };
}
