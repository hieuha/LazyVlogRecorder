// Builds a recording filename: log-<person>-<yyyymmdd-hhmmss>.<ext>.

export function makeRecordingName(personName: string, logNo: number, ext: string): string {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, "0");
  const stamp =
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const safe = personName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `log-${safe || "entry"}-${logNo}-${stamp}.${ext}`;
}

/** Container extension implied by a MediaRecorder mimeType. */
export function extForMime(mime: string): string {
  return mime.includes("mp4") ? "mp4" : "webm";
}
