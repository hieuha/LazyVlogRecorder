// Gate helper for the Go-Live control: streaming is usable only when BOTH the
// RTMP URL and the stream key are present (non-whitespace). Pure function so the
// UI can disable the LIVE button and unit tests can pin the rule.

export interface StreamConfigFields {
  rtmpUrl: string;
  streamKey: string;
}

export function isStreamConfigured(c: StreamConfigFields): boolean {
  return c.rtmpUrl.trim().length > 0 && c.streamKey.trim().length > 0;
}
