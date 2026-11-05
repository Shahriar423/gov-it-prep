import { useEffect } from "react";

export function wakeLockSupported() {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

/** Keeps the screen on while `enabled` is true (supported browsers only). */
export function useWakeLock(enabled) {
  useEffect(() => {
    if (!enabled || !wakeLockSupported()) return undefined;

    let sentinel = null;
    let cancelled = false;

    async function acquire() {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          lock.release().catch(() => {});
        } else {
          sentinel = lock;
        }
      } catch {
        /* the browser said no (for example low battery): ignore */
      }
    }

    // The browser releases the lock when the tab is hidden, so ask again when it comes back
    const onVisible = () => {
      if (document.visibilityState === "visible") acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (sentinel) sentinel.release().catch(() => {});
      sentinel = null;
    };
  }, [enabled]);
}