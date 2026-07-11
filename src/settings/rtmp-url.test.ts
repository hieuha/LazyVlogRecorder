import { describe, expect, it } from "vitest";
import { rtmpUrlWarning } from "./rtmp-url";

describe("rtmpUrlWarning", () => {
  it("is null for an empty URL (not configured yet)", () => {
    expect(rtmpUrlWarning("", "abcd-1234")).toBeNull();
    expect(rtmpUrlWarning("   ", "abcd-1234")).toBeNull();
  });

  it("is null for a proper base URL with the key kept separate", () => {
    expect(rtmpUrlWarning("rtmp://a.rtmp.youtube.com/live2", "abcd-1234-key")).toBeNull();
    expect(rtmpUrlWarning("rtmps://live.twitch.tv/app", "sk_live_xyz")).toBeNull();
  });

  it("warns when the URL is not an rtmp/rtmps scheme", () => {
    expect(rtmpUrlWarning("http://a.rtmp.youtube.com/live2", "k")).toMatch(/rtmp:\/\//);
    expect(rtmpUrlWarning("a.rtmp.youtube.com/live2", "k")).toMatch(/rtmp:\/\//);
  });

  it("warns when the stream key appears inside the URL (would be doubled)", () => {
    expect(
      rtmpUrlWarning("rtmp://a.rtmp.youtube.com/live2/abcd-1234-key", "abcd-1234-key"),
    ).toMatch(/stream key/i);
  });

  it("ignores a too-short 'key' to avoid false positives on common substrings", () => {
    expect(rtmpUrlWarning("rtmp://host/live2", "ab")).toBeNull();
  });
});
