import { describe, expect, it } from "vitest";
import { isStreamConfigured } from "./is-stream-configured";

describe("isStreamConfigured", () => {
  it("is true only when both URL and key are present", () => {
    expect(isStreamConfigured({ rtmpUrl: "rtmp://h/app", streamKey: "abc" })).toBe(true);
  });

  it("is false when the URL is empty", () => {
    expect(isStreamConfigured({ rtmpUrl: "", streamKey: "abc" })).toBe(false);
  });

  it("is false when the key is empty", () => {
    expect(isStreamConfigured({ rtmpUrl: "rtmp://h/app", streamKey: "" })).toBe(false);
  });

  it("treats whitespace-only values as unset", () => {
    expect(isStreamConfigured({ rtmpUrl: "   ", streamKey: "abc" })).toBe(false);
    expect(isStreamConfigured({ rtmpUrl: "rtmp://h/app", streamKey: "  " })).toBe(false);
  });
});
