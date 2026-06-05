import { describe, it, expect } from "vitest";
import { fitFontSize, renderToSvg } from "./toSvg";
import { newModel } from "../model/factory";
import { addElement } from "../model/edit";
import type { RectLibItem, Library } from "../model/types";

describe("fitFontSize", () => {
  it("clamps to a readable range and shrinks for longer text", () => {
    expect(fitFontSize("X", 60, 60)).toBeLessThanOrEqual(10);
    expect(fitFontSize("X", 60, 60)).toBeGreaterThanOrEqual(2.5);
    expect(fitFontSize("FC6A-D16R1CEE", 60, 60)).toBeLessThan(fitFontSize("AB", 60, 60));
    expect(fitFontSize("VERYLONGPARTNUMBER1234", 20, 20)).toBe(2.5); // floor, never overflow
  });
});

describe("renderToSvg — custom placeholder", () => {
  it("draws the part number centered inside a custom rect", () => {
    const lib: Library = {
      cp: { lib_key: "cp", source: "rect", name: "ACME-123", width_mm: 60, height_mm: 40, custom: true } as RectLibItem,
    };
    const { model } = addElement(newModel("T"), "cp", lib, 100, 100);
    const svg = renderToSvg(model, lib);
    expect(svg).toContain("ACME-123");
    expect(svg).toContain('text-anchor="middle"'); // centered, not the top-left tag
  });
});
