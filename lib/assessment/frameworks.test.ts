import { describe, expect, it } from "vitest";
import { FRAMEWORK_REGISTRY, frameworkPolicy, requiresSourceMaterial } from "./frameworks";
import { isBestFitFramework } from "./bands";
import { ASSESSMENT_FRAMEWORKS, ASSESSMENT_FRAMEWORK_LABELS } from "./taxonomy";

/**
 * Canonical framework-registry invariants. There is NO universal rubric across
 * mark totals: each framework carries its own marking method, source gate,
 * band-display validity, and diagram stance — and these must stay consistent
 * with the band table and taxonomy labels.
 */

describe("FRAMEWORK_REGISTRY — one auditable policy table", () => {
  it("covers every framework exactly", () => {
    expect(Object.keys(FRAMEWORK_REGISTRY).sort()).toEqual([...ASSESSMENT_FRAMEWORKS].sort());
  });

  it("band display validity always matches the band table", () => {
    for (const f of ASSESSMENT_FRAMEWORKS) {
      expect(frameworkPolicy(f).showBestFitBands).toBe(isBestFitFramework(f));
    }
  });

  it("student labels come from the single taxonomy source", () => {
    for (const f of ASSESSMENT_FRAMEWORKS) {
      expect(frameworkPolicy(f).studentLabel).toBe(ASSESSMENT_FRAMEWORK_LABELS[f]);
    }
  });

  it("only Paper 2(g) and Paper 3(b) require pasted source material", () => {
    const gated = ASSESSMENT_FRAMEWORKS.filter((f) => requiresSourceMaterial(f));
    expect(gated.sort()).toEqual(["paper2g_15_mark", "paper3b_10_mark"]);
    expect(requiresSourceMaterial(undefined)).toBe(false);
  });

  it("marking methods: best-fit for 10/15 papers, analytic for question-specific parts", () => {
    expect(frameworkPolicy("paper1a_10_mark").markingMethod).toBe("best_fit");
    expect(frameworkPolicy("paper1b_15_mark").markingMethod).toBe("best_fit");
    expect(frameworkPolicy("paper2g_15_mark").markingMethod).toBe("best_fit");
    expect(frameworkPolicy("paper3b_10_mark").markingMethod).toBe("best_fit");
    expect(frameworkPolicy("paper2a_definition").markingMethod).toBe("analytic");
    expect(frameworkPolicy("paper2b_quantitative").markingMethod).toBe("analytic");
    expect(frameworkPolicy("paper3a_analytic").markingMethod).toBe("analytic");
    expect(frameworkPolicy("paper2_short_analytic").markingMethod).toBe("analytic");
    expect(frameworkPolicy("paper2_four_mark_diagram_explain").markingMethod).toBe("template_component");
    expect(frameworkPolicy("generic_practice").markingMethod).toBe("holistic_practice");
  });

  it("the 2+2 diagram component exists ONLY on the recognised template framework", () => {
    const withComponent = ASSESSMENT_FRAMEWORKS.filter(
      (f) => frameworkPolicy(f).diagramPolicy === "template_component"
    );
    expect(withComponent).toEqual(["paper2_four_mark_diagram_explain"]);
  });
});
