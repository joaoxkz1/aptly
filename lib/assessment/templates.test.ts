import { describe, it, expect } from "vitest";
import { matchTemplate } from "./templates";

describe("matchTemplate — four_mark_diagram_explain", () => {
  it("matches a short named-diagram explanation", () => {
    const t = matchTemplate("Using a demand and supply diagram, explain the effect of a subsidy on the market for electric cars.");
    expect(t?.id).toBe("four_mark_diagram_explain");
    expect(t?.totalMarks).toBe(4);
    expect(t?.writtenMarks).toBe(2);
    expect(t?.diagramMarks).toBe(2);
  });

  it("does NOT match an extended evaluate/discuss essay", () => {
    expect(
      matchTemplate("Using a diagram, evaluate the view that indirect taxes are the most effective way to reduce cigarette consumption in the long run and short run for different stakeholders.")
    ).toBeNull();
  });

  it("does NOT match an explanation with no diagram instruction", () => {
    expect(matchTemplate("Explain how a subsidy affects the market for solar panels.")).toBeNull();
  });

  it("does NOT match a long response even if it mentions a diagram", () => {
    const long = "Using a demand and supply diagram, explain " + "the market ".repeat(60);
    expect(matchTemplate(long)).toBeNull();
  });
});
