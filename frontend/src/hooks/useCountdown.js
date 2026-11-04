import { useEffect, useState } from "react";

/**
 * Returns the whole seconds left until `endAtMs` (a Date.now()-style timestamp).
 * The time is recalculated from the clock on every tick, so it stays correct
 * even if the browser tab was in the background.
 * This is only a DISPLAY: the server decides when the exam really ends.
 */
export function useCountdown(endAtMs) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endAtMs]);

  return Math.max(0, Math.ceil((endAtMs - now) / 1000));
}