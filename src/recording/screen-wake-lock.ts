// Keep the screen awake while capturing. On iOS the auto-lock would suspend the
// app and cut the take; this holds a Screen Wake Lock for the duration instead
// of a native isIdleTimerDisabled bridge. Supported in WKWebView (iOS 16.4+) and
// macOS WebKit; a no-op where the API is missing. Best-effort — never throws.

let sentinel: WakeLockSentinel | null = null;

/** Request a screen wake lock (idempotent). */
export async function acquireWakeLock(): Promise<void> {
  try {
    if (!("wakeLock" in navigator) || sentinel) return;
    sentinel = await navigator.wakeLock.request("screen");
    // The OS auto-releases the lock when the page is hidden; drop our reference
    // so a later re-acquire (capture resuming in the foreground) works.
    sentinel.addEventListener("release", () => {
      sentinel = null;
    });
  } catch {
    /* unsupported / denied — fall through */
  }
}

/** Release the wake lock if held. */
export async function releaseWakeLock(): Promise<void> {
  try {
    await sentinel?.release();
  } catch {
    /* ignore */
  }
  sentinel = null;
}

/** Whether a wake lock is currently held (for a foreground re-acquire check). */
export function hasWakeLock(): boolean {
  return sentinel !== null;
}
