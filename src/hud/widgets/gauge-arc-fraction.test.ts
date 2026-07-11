import { describe, expect, it } from "vitest";
import { fraction } from "./gauge-arc";

describe("fraction (gauge dial fill 0..1)", () => {
  it("returns 0 for a null value (offline / no data)", () => {
    expect(fraction(null, 0, 100)).toBe(0);
  });

  it("returns 0 when the range is empty or inverted (avoids divide-by-zero)", () => {
    expect(fraction(5, 10, 10)).toBe(0);
    expect(fraction(5, 10, 5)).toBe(0);
  });

  it("maps a value linearly within [min,max]", () => {
    expect(fraction(50, 0, 100)).toBe(0.5);
    expect(fraction(0, 0, 100)).toBe(0);
    expect(fraction(100, 0, 100)).toBe(1);
    expect(fraction(0, -20, 20)).toBe(0.5); // works with negative min (temp gauge)
  });

  it("clamps out-of-range values to [0,1]", () => {
    expect(fraction(-10, 0, 100)).toBe(0);
    expect(fraction(150, 0, 100)).toBe(1);
  });
});
