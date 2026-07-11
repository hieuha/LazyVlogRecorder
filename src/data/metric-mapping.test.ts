import { describe, expect, it } from "vitest";
import { weatherCodeToText } from "./metric-mapping";

describe("weatherCodeToText (WMO codes)", () => {
  it("maps the exact clear/cloud codes", () => {
    expect(weatherCodeToText(0)).toBe("CLEAR");
    expect(weatherCodeToText(1)).toBe("MOSTLY CLEAR");
    expect(weatherCodeToText(2)).toBe("PARTLY CLOUDY");
    expect(weatherCodeToText(3)).toBe("OVERCAST");
  });

  it("maps fog (45, 48)", () => {
    expect(weatherCodeToText(45)).toBe("FOG");
    expect(weatherCodeToText(48)).toBe("FOG");
  });

  it("maps precipitation ranges by bucket", () => {
    expect(weatherCodeToText(51)).toBe("DRIZZLE");
    expect(weatherCodeToText(57)).toBe("DRIZZLE");
    expect(weatherCodeToText(61)).toBe("RAIN");
    expect(weatherCodeToText(67)).toBe("RAIN");
    expect(weatherCodeToText(71)).toBe("SNOW");
    expect(weatherCodeToText(77)).toBe("SNOW");
    expect(weatherCodeToText(80)).toBe("RAIN SHOWERS");
    expect(weatherCodeToText(82)).toBe("RAIN SHOWERS");
    expect(weatherCodeToText(85)).toBe("SNOW SHOWERS");
    expect(weatherCodeToText(86)).toBe("SNOW SHOWERS");
  });

  it("maps any code >= 95 to thunderstorm", () => {
    expect(weatherCodeToText(95)).toBe("THUNDERSTORM");
    expect(weatherCodeToText(99)).toBe("THUNDERSTORM");
  });

  it("returns UNKNOWN for codes in the gaps", () => {
    for (const code of [50, 58, 68, 78, 83, 84, 87, 94, -1]) {
      expect(weatherCodeToText(code)).toBe("UNKNOWN");
    }
  });
});
