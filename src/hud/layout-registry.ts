// Registry of available HUD layouts. Settings (Phase 6) lists these so users can
// switch look; adding a layout = import it and add one entry here.

import type { LayoutConfig } from "./types";
import { martianLayout } from "./layouts/martian.layout";

export const DEFAULT_LAYOUT_ID = "martian";

const LAYOUTS: Record<string, LayoutConfig> = {
  [martianLayout.id]: martianLayout,
};

export function getLayout(id: string): LayoutConfig {
  return LAYOUTS[id] ?? LAYOUTS[DEFAULT_LAYOUT_ID];
}

export function listLayouts(): Array<{ id: string; name: string }> {
  return Object.values(LAYOUTS).map((l) => ({ id: l.id, name: l.name }));
}
