import { describe, it, expect } from "vitest";
import { bestFitBand, isBestFitFramework } from "./bands";

describe("isBestFitFramework", () => {
  it("is true only for the 10/15-mark paper frameworks", () => {
    expect(isBestFitFramework("paper1a_10_mark")).toBe(true);
    expect(isBestFitFramework("paper1b_15_mark")).toBe(true);
    expect(isBestFitFramework("paper2g_15_mark")).toBe(true);
    expect(isBestFitFramework("paper3b_10_mark")).toBe(true);
    expect(isBestFitFramework("paper2_four_mark_diagram_explain")).toBe(false);
    expect(isBestFitFramework("paper2_short_analytic")).toBe(false);
    expect(isBestFitFramework("paper2a_definition")).toBe(false);
    expect(isBestFitFramework("paper2b_quantitative")).toBe(false);
    expect(isBestFitFramework("paper3a_analytic")).toBe(false);
    expect(isBestFitFramework("generic_practice")).toBe(false);
  });
});

describe("bestFitBand — 10-mark bands", () => {
  it("places 7/10 in band 7–8 at the lower end", () => {
    const b = bestFitBand("paper1a_10_mark", 7);
    expect(b).toEqual({ low: 7, high: 8, placement: "lower" });
  });
  it("places 8/10 in band 7–8 at the upper end", () => {
    expect(bestFitBand("paper1a_10_mark", 8)?.placement).toBe("upper");
  });
  it("returns band 0 for a zero mark", () => {
    expect(bestFitBand("paper3b_10_mark", 0)).toEqual({ low: 0, high: 0, placement: "middle" });
  });
});

describe("bestFitBand — 15-mark bands", () => {
  it("places 13/15 in band 13–15 at the lower end", () => {
    expect(bestFitBand("paper1b_15_mark", 13)).toEqual({ low: 13, high: 15, placement: "lower" });
  });
  it("places 14/15 in the middle", () => {
    expect(bestFitBand("paper1b_15_mark", 14)?.placement).toBe("middle");
  });
  it("places 15/15 at the upper end", () => {
    expect(bestFitBand("paper2g_15_mark", 15)?.placement).toBe("upper");
  });
});

describe("bestFitBand — no band for non-best-fit frameworks", () => {
  it("returns null for the diagram template, analytic parts, and generic practice", () => {
    expect(bestFitBand("paper2_four_mark_diagram_explain", 2)).toBeNull();
    expect(bestFitBand("generic_practice", 8)).toBeNull();
    expect(bestFitBand("paper2_short_analytic", 2)).toBeNull();
    expect(bestFitBand("paper2a_definition", 2)).toBeNull();
    expect(bestFitBand("paper2b_quantitative", 3)).toBeNull();
    expect(bestFitBand("paper3a_analytic", 4)).toBeNull();
  });
});
