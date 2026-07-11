import { describe, expect, it } from "vitest";
import { cameraDeviceIdForKey, isEditableTarget } from "./keyboard-shortcuts";

const el = (tagName: string) => ({ tagName }) as unknown as EventTarget;

describe("isEditableTarget", () => {
  it("is true for editable/interactive elements", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT", "BUTTON"]) {
      expect(isEditableTarget(el(tag))).toBe(true);
    }
  });

  it("is false for non-editable targets and null", () => {
    expect(isEditableTarget(el("DIV"))).toBe(false);
    expect(isEditableTarget(el("CANVAS"))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe("cameraDeviceIdForKey", () => {
  const cameras = [{ deviceId: "cam-a" }, { deviceId: "cam-b" }, { deviceId: "cam-c" }];

  it("maps Digit/Numpad 1–N to the Nth camera", () => {
    expect(cameraDeviceIdForKey("Digit1", cameras)).toBe("cam-a");
    expect(cameraDeviceIdForKey("Digit3", cameras)).toBe("cam-c");
    expect(cameraDeviceIdForKey("Numpad2", cameras)).toBe("cam-b");
  });

  it("returns null for non 1–4 keys", () => {
    expect(cameraDeviceIdForKey("Digit5", cameras)).toBeNull();
    expect(cameraDeviceIdForKey("Digit0", cameras)).toBeNull();
    expect(cameraDeviceIdForKey("KeyA", cameras)).toBeNull();
    expect(cameraDeviceIdForKey("Space", cameras)).toBeNull();
  });

  it("returns null when no camera occupies that slot", () => {
    expect(cameraDeviceIdForKey("Digit4", cameras)).toBeNull(); // only 3 cameras
    expect(cameraDeviceIdForKey("Digit1", [])).toBeNull();
  });
});
