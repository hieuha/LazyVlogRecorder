import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Tauri Store so loadConfig/saveConfig hit controllable in-memory fns
// instead of the filesystem. vi.hoisted keeps the mock fns initialized before the
// (hoisted) module import instantiates `new LazyStore()`.
const { getMock, setMock, saveMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  setMock: vi.fn(async () => {}),
  saveMock: vi.fn(async () => {}),
}));
vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    get = getMock;
    set = setMock;
    save = saveMock;
  },
}));

import { DEFAULT_CONFIG, generateToken, loadConfig, saveConfig } from "./config-store";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadConfig", () => {
  it("merges saved values over the defaults (saved wins, missing keys = defaults)", async () => {
    getMock.mockResolvedValueOnce({ personName: "Zoe", recordHeight: 720 });
    const cfg = await loadConfig();
    expect(cfg.personName).toBe("Zoe"); // overridden
    expect(cfg.recordHeight).toBe(720); // overridden
    expect(cfg.streamFps).toBe(DEFAULT_CONFIG.streamFps); // default preserved
    expect(cfg.streamEncoder).toBe(DEFAULT_CONFIG.streamEncoder);
  });

  it("returns a full default config when nothing is stored", async () => {
    getMock.mockResolvedValueOnce(undefined);
    expect(await loadConfig()).toEqual(DEFAULT_CONFIG);
  });

  it("falls back to defaults when the store throws (corrupt/unavailable)", async () => {
    getMock.mockRejectedValueOnce(new Error("corrupt store"));
    expect(await loadConfig()).toEqual(DEFAULT_CONFIG);
  });

  it("does not drop unknown persisted keys (forward-compat)", async () => {
    getMock.mockResolvedValueOnce({ futureFlag: true });
    const cfg = (await loadConfig()) as unknown as Record<string, unknown>;
    expect(cfg.futureFlag).toBe(true);
  });
});

describe("saveConfig", () => {
  it("writes the config under 'config' and persists it", async () => {
    await saveConfig(DEFAULT_CONFIG);
    expect(setMock).toHaveBeenCalledWith("config", DEFAULT_CONFIG);
    expect(saveMock).toHaveBeenCalledOnce();
  });
});

describe("generateToken", () => {
  it("produces a 32-char lowercase hex string (16 random bytes)", () => {
    const t = generateToken();
    expect(t).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is different across calls", () => {
    expect(generateToken()).not.toBe(generateToken());
  });
});
