// Pure helpers for the app's global keyboard shortcuts, extracted from App so the
// key → action mapping is unit-testable without mounting the whole component.

/** True when the event target is an editable/interactive element, so a global
 *  shortcut must NOT hijack the key (e.g. typing a digit into an input). */
export function isEditableTarget(target: EventTarget | null): boolean {
  const tag = (target as HTMLElement | null)?.tagName;
  return tag ? /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(tag) : false;
}

/** The camera deviceId to switch to for a Digit/Numpad 1–4 key, or null when the
 *  key isn't a 1–4 digit or there is no camera at that slot. Keys map to the
 *  camera list order (same as the camera dropdown). */
export function cameraDeviceIdForKey(
  code: string,
  cameras: readonly { deviceId: string }[],
): string | null {
  const m = /^(?:Digit|Numpad)([1-4])$/.exec(code);
  if (!m) return null;
  return cameras[Number(m[1]) - 1]?.deviceId ?? null;
}
