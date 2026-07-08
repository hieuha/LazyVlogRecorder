// Layout engine: resolves each widget's anchor to a canvas origin and dispatches
// to the matching widget draw function. This file is layout-agnostic — a new
// layout is just a different LayoutConfig; adding a widget TYPE adds one case.

import type { Anchor, LayoutConfig, HudState, Vec2, WidgetRenderContext } from "./types";
import { drawGaugeArc } from "./widgets/gauge-arc";
import {
  drawClock,
  drawEnvironment,
  drawLocation,
  drawLogEntry,
  drawMissionDay,
} from "./widgets/readout-widgets";
import { drawColorGrade, drawCornerFrame, drawScanline } from "./widgets/frame-widgets";
import { drawSoundwave } from "./widgets/soundwave-widget";
import { drawSensorPanel } from "./widgets/sensor-panel-widget";
import { drawSeriesPanel } from "./widgets/series-panel-widget";
import { drawCaption } from "./widgets/caption-widget";
import type { LayerContext } from "../compositor/canvas-compositor";

/**
 * Build a compositor layer that renders the given layout with live state.
 * `getState` is called each frame so the HUD reflects the latest values.
 */
export function createHudLayer(
  layout: LayoutConfig,
  getState: () => HudState,
): (layer: LayerContext) => void {
  return ({ ctx, width, height }: LayerContext) => {
    const baseU = width / 100; // positions use the real unit
    const sizeU = baseU * (layout.fontScale ?? 1); // widget text/size unit
    const state = getState();
    for (const spec of layout.widgets) {
      const origin = resolveAnchor(spec.anchor, spec.offset, width, height, baseU);
      const c: WidgetRenderContext = {
        ctx,
        origin,
        width,
        height,
        u: sizeU,
        theme: layout.theme,
        state,
      };
      dispatch(c, spec);
    }
  };
}

function dispatch(c: WidgetRenderContext, spec: LayoutConfig["widgets"][number]): void {
  switch (spec.type) {
    case "mission-day":
      return drawMissionDay(c);
    case "log-entry":
      return drawLogEntry(c);
    case "clock":
      return drawClock(c);
    case "gauge-arc":
      return drawGaugeArc(c, spec);
    case "environment":
      return drawEnvironment(c);
    case "location":
      return drawLocation(c);
    case "corner-frame":
      return drawCornerFrame(c, spec.anchor);
    case "scanline":
      return drawScanline(c);
    case "color-grade":
      return drawColorGrade(c);
    case "soundwave":
      return drawSoundwave(c, spec.widthPct);
    case "sensor-panel":
      return drawSensorPanel(c);
    case "series-panel":
      return drawSeriesPanel(c);
    case "caption":
      return drawCaption(c);
  }
}

function resolveAnchor(
  anchor: Anchor,
  offset: Vec2,
  width: number,
  height: number,
  u: number,
): Vec2 {
  const baseX = anchor.includes("right")
    ? width
    : anchor.includes("center")
      ? width / 2
      : 0;
  const baseY = anchor.startsWith("mid")
    ? height / 2
    : anchor.includes("bottom")
      ? height
      : 0;
  return { x: baseX + offset.x * u, y: baseY + offset.y * u };
}
