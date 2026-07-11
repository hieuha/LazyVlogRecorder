import { describe, expect, it } from "vitest";
import { resolveAnchor } from "./layout-engine";
import type { Anchor } from "./types";

// width/height/u chosen so the anchor base and the offset term are easy to read:
// offset {x,y} contributes {x*u, y*u} = {+20, +30} on top of the anchor base.
const W = 1000;
const H = 500;
const U = 10;
const at = (anchor: Anchor) => resolveAnchor(anchor, { x: 2, y: 3 }, W, H, U);

describe("resolveAnchor", () => {
  it("anchors X: left=0, center=width/2, right=width", () => {
    expect(at("top-left").x).toBe(0 + 20);
    expect(at("top-center").x).toBe(W / 2 + 20);
    expect(at("top-right").x).toBe(W + 20);
  });

  it("anchors Y: top=0, mid=height/2, bottom=height", () => {
    expect(at("top-left").y).toBe(0 + 30);
    expect(at("mid-left").y).toBe(H / 2 + 30);
    expect(at("bottom-left").y).toBe(H + 30);
  });

  it("resolves every corner + edge combination", () => {
    expect(at("top-right")).toEqual({ x: 1020, y: 30 });
    expect(at("mid-right")).toEqual({ x: 1020, y: 280 });
    expect(at("bottom-right")).toEqual({ x: 1020, y: 530 });
    expect(at("bottom-center")).toEqual({ x: 520, y: 530 });
  });

  it("applies negative offsets (right/bottom widgets inset inward)", () => {
    expect(resolveAnchor("top-right", { x: -4, y: 2 }, W, H, U)).toEqual({ x: W - 40, y: 20 });
    expect(resolveAnchor("bottom-left", { x: 4, y: -2 }, W, H, U)).toEqual({ x: 40, y: H - 20 });
  });

  it("scales the offset by u (not the anchor base)", () => {
    expect(resolveAnchor("top-left", { x: 1, y: 1 }, W, H, 4)).toEqual({ x: 4, y: 4 });
    expect(resolveAnchor("bottom-right", { x: 0, y: 0 }, W, H, 4)).toEqual({ x: W, y: H });
  });
});
