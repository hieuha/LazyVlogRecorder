// Cheap, advisory validation for the Go-Live RTMP URL — catches the two mistakes
// that make ffmpeg return "404 / not found": a non-rtmp URL, and the stream key
// pasted into the URL (the app appends the key itself, so it would be doubled).
// Returns a human hint, or null when the URL looks fine. Never blocks — the LIVE
// gate still uses is-stream-configured for enablement.

export function rtmpUrlWarning(url: string, key: string): string | null {
  const u = url.trim();
  if (!u) return null; // empty is "not configured", handled elsewhere
  if (!/^rtmps?:\/\//i.test(u)) {
    return "URL should start with rtmp:// or rtmps://";
  }
  const k = key.trim();
  if (k.length >= 4 && u.includes(k)) {
    return "The stream key looks like it's in the URL — keep it in the Stream key field only (the app adds it for you)";
  }
  return null;
}
