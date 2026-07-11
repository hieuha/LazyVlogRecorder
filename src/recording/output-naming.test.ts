import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extForMime, makeRecordingName } from "./output-naming";

describe("makeRecordingName", () => {
  beforeEach(() => {
    // Fix the clock so the timestamp portion is deterministic.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 11, 9, 5, 3)); // 2026-07-11 09:05:03 (month is 0-based)
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds log-<person>-<logNo>-<yyyymmdd-hhmmss>.<ext> with zero-padded stamp", () => {
    expect(makeRecordingName("Harry", 7, "mp4")).toBe("log-harry-7-20260711-090503.mp4");
  });

  it("lowercases and slugifies the person name (spaces/symbols → single dashes)", () => {
    expect(makeRecordingName("John  O'Brien!!", 1, "webm")).toBe("log-john-o-brien-1-20260711-090503.webm");
  });

  it("trims leading/trailing dashes from the slug", () => {
    expect(makeRecordingName("  @Harry@  ", 2, "mp4")).toBe("log-harry-2-20260711-090503.mp4");
  });

  it("falls back to 'entry' when the name has no alphanumerics", () => {
    expect(makeRecordingName("***", 3, "mp4")).toBe("log-entry-3-20260711-090503.mp4");
    expect(makeRecordingName("", 4, "webm")).toBe("log-entry-4-20260711-090503.webm");
  });

  it("passes the extension through verbatim", () => {
    expect(makeRecordingName("h", 1, "mkv")).toMatch(/\.mkv$/);
  });
});

describe("extForMime", () => {
  it("returns mp4 for any mp4 mime", () => {
    expect(extForMime("video/mp4;codecs=avc1.42E01E,mp4a.40.2")).toBe("mp4");
    expect(extForMime("video/mp4")).toBe("mp4");
  });

  it("returns webm for webm / non-mp4 mimes", () => {
    expect(extForMime("video/webm;codecs=vp8,opus")).toBe("webm");
    expect(extForMime("video/webm")).toBe("webm");
    expect(extForMime("")).toBe("webm");
  });
});
