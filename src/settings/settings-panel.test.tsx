import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// config-store instantiates a LazyStore at import; stub it so no fs is touched.
vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    get = vi.fn();
    set = vi.fn();
    save = vi.fn();
  },
}));

import { DEFAULT_CONFIG } from "./config-store";
import { SettingsPanel } from "./settings-panel";

function renderPanel(over: Partial<Parameters<typeof SettingsPanel>[0]> = {}) {
  const props = {
    config: { ...DEFAULT_CONFIG },
    setField: vi.fn(),
    layouts: [{ id: "martian", name: "Martian" }],
    themes: [{ id: "teal", name: "Teal" }],
    onBrowse: vi.fn(),
    onClose: vi.fn(),
    onSave: vi.fn(),
    onRegenerateToken: vi.fn(),
    ...over,
  };
  return { props, ...render(<SettingsPanel {...props} />) };
}

afterEach(cleanup);

describe("SettingsPanel", () => {
  it("edits a text field through setField", () => {
    const { props } = renderPanel();
    fireEvent.change(screen.getByDisplayValue(DEFAULT_CONFIG.personName), {
      target: { value: "Zoe" },
    });
    expect(props.setField).toHaveBeenCalledWith("personName", "Zoe");
  });

  it("wires SAVE / CANCEL / close to their callbacks", () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "SAVE" }));
    expect(props.onSave).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "CANCEL" }));
    expect(props.onClose).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "✕" }));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it("confirms before enabling the network API service, then applies + seeds a token", () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByLabelText("Enable API Service"));
    // A confirm dialog appears; nothing applied yet.
    expect(screen.getByText("ENABLE API SERVICE?")).toBeInTheDocument();
    expect(props.setField).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "CONFIRM" }));
    expect(props.setField).toHaveBeenCalledWith("sensorApiEnabled", true);
    // token seeded because the default config has none
    expect(props.setField).toHaveBeenCalledWith("sensorApiToken", expect.stringMatching(/^[0-9a-f]{32}$/));
  });

  it("opens the Change-PIN flow", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Change PIN" }));
    expect(screen.getByText("CURRENT PIN")).toBeInTheDocument();
  });
});
