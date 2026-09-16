import { describe, expect, it } from "vitest";
import { validateExaminerJudgment, type ExaminerJudgment } from "./examiner-judgment";
import { resolveScoringPolicy } from "@/lib/assessment/policy";
import { resolveAssessmentContract } from "@/lib/assessment/trusted-contract";
import type { AssessmentFramework } from "@/lib/types";
import { bestFitBand } from "@/lib/assessment/bands";

function contract(framework: AssessmentFramework = "paper1a_10_mark") {
  const question = "Explain how pollution from production causes market failure. [10]";
  const policy = resolveScoringPolicy(question, { requestedFramework: framework, requestedSource: null, requestedTotal: null, templateId: null, sourceMaterial: null });
  return resolveAssessmentContract({ policy, question, topic: "2.8", sourceMaterial: null })!;
}
const judgment = (overrides: Partial<ExaminerJudgment> = {}): ExaminerJudgment => ({
  task: "Explain external costs and inefficient allocation", demonstrated: "Accurate causal analysis connects external costs to excess output and welfare loss.",
  materialLimitations: ["The necessary graphical representation is absent."], selectedBand: "9-10", withinBand: "lower", diagramEffect: "missing_material",
  summary: "Strong developed economics is balanced against a material missing representation.", ...overrides,
});
describe("examiner judgment consistency, not a score prediction", () => {
  it("allows compensation into the highest band despite a diagram omission; no universal eight-mark ceiling", () => {
    expect(validateExaminerJudgment(judgment(), contract(), 9, "not_provided")).toEqual(judgment());
  });
  it("rejects full credit with a material unmet task demand instead of assigning a replacement score", () => {
    expect(() => validateExaminerJudgment(judgment({ withinBand: "upper" }), contract(), 10, "not_provided")).toThrow("contradictory");
    expect(() => validateExaminerJudgment(judgment({ withinBand: "upper", materialLimitations: [] }), contract(), 10, "not_provided")).toThrow("contradictory");
  });
  it.each([0, 1, 4, 6, 8, 9, 10])("maps only the awarded mark to its band, without diagnostic arithmetic: %s", mark => {
    const band = bestFitBand("paper1a_10_mark", mark)!;
    expect(validateExaminerJudgment(judgment({ selectedBand: band.markBand, withinBand: band.placement, diagramEffect: "integrated", materialLimitations: [] }), contract(), mark, "usable")).not.toBeNull();
  });
  it("does not gate Paper 2(g) full marks on a diagram", () => {
    const c = { ...contract(), framework: "paper2g_15_mark" as const, total: 15, diagramRole: "optional_appropriate" as const };
    expect(validateExaminerJudgment(judgment({ selectedBand: "13-15", withinBand: "upper", diagramEffect: "not_required", materialLimitations: [] }), c, 15, "not_provided")).not.toBeNull();
  });
  it("rejects fictitious diagram integration, wrong band and wrong within-band placement", () => {
    for (const change of [{ diagramEffect: "integrated" as const }, { selectedBand: "7-8" }, { withinBand: "upper" as const }]) {
      expect(() => validateExaminerJudgment(judgment(change), contract(), 9, "not_provided")).toThrow();
    }
  });
  it("keeps uncertain roles explicit and non-best-fit frameworks free of official-looking bands", () => {
    const c = { ...contract(), diagramRole: "unresolved" as const };
    expect(validateExaminerJudgment(judgment({ diagramEffect: "unresolved" }), c, 9, "not_provided")).not.toBeNull();
    expect(() => validateExaminerJudgment(judgment({ diagramEffect: "not_required" }), c, 9, "not_provided")).toThrow();
    expect(validateExaminerJudgment(null, { ...c, framework: "generic_practice" }, 9, "not_provided")).toBeNull();
    expect(() => validateExaminerJudgment(judgment(), { ...c, framework: "paper3a_analytic" }, 9, "not_provided")).toThrow();
  });
});
