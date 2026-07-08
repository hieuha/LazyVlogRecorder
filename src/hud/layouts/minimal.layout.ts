// Minimal layout — a second, pared-down look built entirely from the existing
// widget library. Demonstrates the extensibility invariant: adding a layout is
// a single declarative file + one registry entry; no engine/widget changes.

import type { LayoutConfig } from "../types";
import { martianTheme } from "../theme";

export const minimalLayout: LayoutConfig = {
  id: "minimal",
  name: "Minimal",
  theme: martianTheme,
  fontScale: 0.8,
  widgets: [
    { type: "clock", anchor: "top-right", offset: { x: -4, y: 5 } },
    { type: "location", anchor: "bottom-left", offset: { x: 4, y: -4 } },
    { type: "soundwave", anchor: "bottom-right", offset: { x: -4, y: -5.5 }, widthPct: 0.28 },
    { type: "corner-frame", anchor: "top-right", offset: { x: -2, y: 2 } },
    { type: "corner-frame", anchor: "bottom-left", offset: { x: 2, y: -2 } },
  ],
};
