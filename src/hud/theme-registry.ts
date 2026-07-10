// Registry of selectable HUD themes (palettes). Decoupled from layouts: a theme
// restyles whichever layout is active. Settings lists these; adding a theme =
// define it in theme.ts, import it, and add one entry here.

import type { HudTheme } from "./types";
import { martianTheme, marsAmberTheme, greenHackerTheme, cryptTheme } from "./theme";

export const DEFAULT_THEME_ID = "martian";

const THEMES: Record<string, { name: string; theme: HudTheme }> = {
  martian: { name: "Teal", theme: martianTheme },
  amber: { name: "Amber", theme: marsAmberTheme },
  green: { name: "Green", theme: greenHackerTheme },
  crypt: { name: "Crypt", theme: cryptTheme },
};

export function getTheme(id: string): HudTheme {
  return (THEMES[id] ?? THEMES[DEFAULT_THEME_ID]).theme;
}

export function listThemes(): Array<{ id: string; name: string }> {
  return Object.entries(THEMES).map(([id, t]) => ({ id, name: t.name }));
}
