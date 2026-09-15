import { describe, expect, it } from "vitest";
import { reconcileComponents, type ComponentEvaluation } from "./component-scoring";
import type { DiagramEvidenceState } from "./diagram-contract";

// Synthetic policy fixtures: numbers below are test inputs, never student/model evidence.
const rules = ["within_part_ecf", "mechanism_consistency_2", "question_label_ceiling_3"];
const input = { state: "usable" as DiagramEvidenceState, hasExplanation: true, rules, labelingRuleReason: "This original question uses the scoped labeling ceiling." };
function evaluation(overrides: Partial<ComponentEvaluation> = {}): ComponentEvaluation {
  return {
    diagram: 2, explanation: 2,
    diagramReason: "The observed shift and new equilibrium answer this task.",
    explanationReason: "The explanation develops the same causal mechanism.",
    incompatibleMechanisms: false, mismatchEvidence: "",
    labelingDeficiency: false, labelingEvidence: "", rootErrors: [], ...overrides,
  };
}

describe("supported four-mark component arithmetic", () => {
  it.each([
    ["both complete", "usable", true, 4, 2, 2],
    ["explanation only", "not_provided", true, 2, 0, 2],
    ["diagram only", "usable", false, 2, 2, 0],
    ["empty evidence", "not_provided", false, 0, 0, 0],
  ] as const)("%s", (_name, state, hasExplanation, total, diagram, explanation) => {
    const result = reconcileComponents(evaluation(), { ...input, state, hasExplanation });
    expect(result).toMatchObject({ total, rawTotal: total, diagram, explanation, ceilings: [] });
  });

  it.each(Array.from({ length: 9 }, (_, i) => [Math.floor(i / 3), i % 3]))(
    "preserves partial evidence: diagram=%i explanation=%i", (diagram, explanation) => {
      const result = reconcileComponents(evaluation({ diagram, explanation }), input);
      expect(result.total).toBe(diagram + explanation);
      expect(result.rawTotal).toBe(diagram + explanation);
    },
  );

  it.each(["not_provided", "no_relevant_diagram"] as const)("%s never earns visual credit from a provider claim", state => {
    expect(reconcileComponents(evaluation(), { ...input, state }).diagram).toBe(0);
  });

  it("marks a readable but completely wrong diagram as zero", () => {
    expect(reconcileComponents(evaluation({ diagram: 0, explanation: 0 }), input).total).toBe(0);
  });

  it("allows partially readable evidence after essential-readability gating", () => {
    expect(reconcileComponents(evaluation({ diagram: 1 }), { ...input, state: "partially_readable" }).total).toBe(3);
  });

  it.each(["pending", "unreadable_ambiguous", "processing_failure"] as const)("%s is not a definitive zero", state => {
    expect(() => reconcileComponents(evaluation(), { ...input, state })).toThrow("essential evidence unavailable");
  });

  it.each([-1, 3, 1.5, NaN, Infinity, "2", null, undefined])("rejects invalid component %s before arithmetic", value => {
    for (const key of ["diagram", "explanation"] as const) {
      expect(() => reconcileComponents(evaluation({ [key]: value } as Partial<ComponentEvaluation>), input)).toThrow("component marks outside 0..2");
    }
  });
});

describe("scoped ceilings and consistency", () => {
  const mismatch = { incompatibleMechanisms: true, mismatchEvidence: "Diagram shifts supply left; explanation attributes the outcome to demand rising." };
  const labeling = { labelingDeficiency: true, labelingEvidence: "The visible vertical axis says quantity instead of price." };

  it("records a 2/4 incompatibility ceiling and unreconciled components explicitly", () => {
    const decision = reconcileComponents(evaluation(mismatch), input);
    expect(decision).toMatchObject({ diagram: 2, explanation: 2, rawTotal: 4, total: 2 });
    expect(decision.ceilings).toEqual([{ rule: "mechanism_consistency_2", maximum: 2, reason: mismatch.mismatchEvidence }]);
  });

  it("does not cap a coherent alternative or harmless notation difference", () => {
    expect(reconcileComponents(evaluation({ diagramReason: "A coherent supply contraction uses equivalent curve labels." }), input).total).toBe(4);
  });

  it("does not export consistency rules into another question contract", () => {
    expect(reconcileComponents(evaluation(mismatch), { ...input, rules: [] }).total).toBe(4);
  });

  it.each([[0, 2], [2, 0]])("does not invent incompatible components when one is absent (%i,%i)", (diagram, explanation) => {
    const d = reconcileComponents(evaluation({ ...mismatch, diagram, explanation }), input);
    expect(d.ceilings).toEqual([]);
    expect(d.total).toBe(2);
  });

  it("applies the labeling ceiling as a maximum, without a second deduction", () => {
    expect(reconcileComponents(evaluation(labeling), input).total).toBe(3);
    expect(reconcileComponents(evaluation({ ...labeling, diagram: 1 }), input).total).toBe(3);
    expect(reconcileComponents(evaluation({ ...labeling, diagram: 1, explanation: 1 }), input).total).toBe(2);
    expect(reconcileComponents(evaluation({ ...labeling, diagram: 0, explanation: 1 }), input).total).toBe(1);
  });

  it("requires both a selected labeling rule and its question rationale", () => {
    expect(reconcileComponents(evaluation(labeling), { ...input, rules: ["within_part_ecf"] }).total).toBe(4);
    expect(reconcileComponents(evaluation(labeling), { ...input, labelingRuleReason: null }).total).toBe(4);
  });

  it("combines ceilings by minimum rather than accumulating deductions", () => {
    const d = reconcileComponents(evaluation({ ...mismatch, ...labeling }), input);
    expect(d.total).toBe(2);
    expect(d.ceilings).toHaveLength(2);
    expect(d.rawTotal).toBe(4);
  });

  it("rejects unsupported claims of a defect", () => {
    expect(() => reconcileComponents(evaluation({ incompatibleMechanisms: true }), input)).toThrow("mismatch requires evidence");
    expect(() => reconcileComponents(evaluation({ labelingDeficiency: true, labelingEvidence: "  " }), input)).toThrow("label ceiling requires evidence");
  });
});

describe("same-part error carry forward records", () => {
  const root = { id: "supply-direction", diagramEvidence: "Supply shifts left after the subsidy.", explanationEvidence: "The answer correctly follows its own leftward shift to a higher price.", carriedForward: true };

  it("preserves explanation credit already judged using own-figure logic", () => {
    const d = reconcileComponents(evaluation({ diagram: 1, explanation: 2, rootErrors: [root] }), input);
    expect(d.total).toBe(3);
    expect(d.rootErrors).toEqual([root]);
  });

  it("does not restore a mark lost for an unrelated explanation error", () => {
    expect(reconcileComponents(evaluation({ diagram: 1, explanation: 1, rootErrors: [root] }), input).total).toBe(2);
  });

  it("rejects carry forward when the selected part has no ECF rule", () => {
    expect(() => reconcileComponents(evaluation({ rootErrors: [root] }), { ...input, rules: [] })).toThrow("ECF outside scope");
  });

  it("permits an observed relationship without claiming ECF credit", () => {
    expect(reconcileComponents(evaluation({ rootErrors: [{ ...root, carriedForward: false }] }), { ...input, rules: [] }).rootErrors).toHaveLength(1);
  });

  it.each(["id", "diagramEvidence", "explanationEvidence"] as const)("rejects empty %s", key => {
    expect(() => reconcileComponents(evaluation({ rootErrors: [{ ...root, [key]: " " }] }), input)).toThrow("invalid root-error relationship");
  });

  it("rejects duplicate root IDs", () => {
    expect(() => reconcileComponents(evaluation({ rootErrors: [root, root] }), input)).toThrow("invalid root-error relationship");
  });
});
