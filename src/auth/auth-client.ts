// Frontend wrappers for the local PIN gate commands.

import { invoke } from "@tauri-apps/api/core";

export function hasPin(): Promise<boolean> {
  return invoke<boolean>("has_pin");
}

export function savePin(pin: string): Promise<void> {
  return invoke("set_pin", { pin });
}

export function verifyPin(pin: string): Promise<boolean> {
  return invoke<boolean>("verify_pin", { pin });
}

export function changePin(oldPin: string, newPin: string): Promise<void> {
  return invoke("change_pin", { oldPin, newPin });
}
