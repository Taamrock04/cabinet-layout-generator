import { describe, it, expect } from "vitest";
import {
  normDeg,
  rotatedFootprint,
  topLeftToBottomLeft,
  bottomLeftToTopLeft,
  placedBox,
  boxesOverlap,
  boxWithinPlate,
} from "./geometry";

describe("normDeg", () => {
  it("wraps into [0,360)", () => {
    expect(normDeg(0)).toBe(0);
    expect(normDeg(360)).toBe(0);
    expect(normDeg(-90)).toBe(270);
    expect(normDeg(450)).toBe(90);
  });
});

describe("rotatedFootprint", () => {
  const s = { w: 70, h: 100 };
  it("0/180 keep W×H", () => {
    expect(rotatedFootprint(s, 0)).toEqual({ w: 70, h: 100 });
    expect(rotatedFootprint(s, 180)).toEqual({ w: 70, h: 100 });
  });
  it("90/270 swap W×H", () => {
    expect(rotatedFootprint(s, 90)).toEqual({ w: 100, h: 70 });
    expect(rotatedFootprint(s, 270)).toEqual({ w: 100, h: 70 });
  });
  it("arbitrary angle gives an enveloping bbox (>= each dimension)", () => {
    const f = rotatedFootprint(s, 45);
    expect(f.w).toBeGreaterThan(70);
    expect(f.h).toBeGreaterThan(70);
  });
});

describe("coordinate conversion (single place)", () => {
  it("flips around plate height and round-trips", () => {
    expect(topLeftToBottomLeft(120, 1500)).toBe(1380);
    expect(bottomLeftToTopLeft(1380, 1500)).toBe(120);
    expect(bottomLeftToTopLeft(topLeftToBottomLeft(42, 700), 700)).toBe(42);
  });
});

describe("placedBox + overlap + within-plate", () => {
  it("uses rotated footprint for the box", () => {
    const b = placedBox({ x: 10, y: 20 }, { w: 70, h: 100 }, 90);
    expect(b).toEqual({ x: 10, y: 20, w: 100, h: 70 });
  });
  it("touching edges do not count as overlap", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 10, y: 0, w: 10, h: 10 };
    expect(boxesOverlap(a, b)).toBe(false);
    expect(boxesOverlap(a, { x: 9.9, y: 0, w: 10, h: 10 })).toBe(true);
  });
  it("detects off-plate (warn-but-allow uses negation)", () => {
    const plate = { w: 800, h: 1500 };
    expect(boxWithinPlate({ x: 0, y: 0, w: 800, h: 1500 }, plate)).toBe(true);
    expect(boxWithinPlate({ x: 790, y: 0, w: 20, h: 10 }, plate)).toBe(false);
  });
});
