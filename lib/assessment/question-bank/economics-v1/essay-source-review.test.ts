import { describe, expect, it } from "vitest";
import { ECONOMICS_QUESTION_BANK, RETIRED_BANK_QUESTIONS } from "./index";
import { ESSAY_DIAGRAM_AUDIT } from "./essay-diagram-audit";
import { eligibleBankQuestions } from "./selection";
import type { ExtendedGradingBlueprint } from "./types";

function question(id: string) {
  const entry = ECONOMICS_QUESTION_BANK.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Missing audited question ${id}`);
  return entry;
}

function extended(id: string): ExtendedGradingBlueprint {
  const blueprint = question(id).gradingBlueprint;
  if (blueprint.kind !== "extended") throw new Error(`Not an essay: ${id}`);
  return blueprint;
}

function eligible(id: string, courseLevel: "sl" | "hl") {
  const entry = question(id);
  return eligibleBankQuestions(ECONOMICS_QUESTION_BANK, {
    marks: entry.marks,
    topicCode: entry.topicCode,
    courseLevel,
  }).some((candidate) => candidate.id === id);
}

describe("September 2026 essay source review", () => {
  it("retains a diagram judgment for every original essay, including retired historical IDs", () => {
    const essays = ECONOMICS_QUESTION_BANK.filter((entry) => entry.marks >= 10);
    expect(essays).toHaveLength(211);
    expect(Object.keys(ESSAY_DIAGRAM_AUDIT).sort()).toEqual(essays.map((entry) => entry.id).sort());
    expect(essays.filter((entry) => entry.qualityStatus !== "deprecated")).toHaveLength(186);
    expect(Object.values(ESSAY_DIAGRAM_AUDIT).filter((entry) => entry.role === "necessary_for_task")).toHaveLength(80);
  });

  it.each([
    "econ-v1-2.1-15-004",
    "econ-v1-2.5-10-003",
    "econ-v1-3.6-10-002",
    "econ-v1-4.5-15-003",
  ])("excludes the verified HL extension %s from SL practice", (id) => {
    expect(eligible(id, "sl")).toBe(false);
    expect(eligible(id, "hl")).toBe(true);
  });

  it("keeps every behavioral-economics essay in the amended guide's HL-only scope", () => {
    const essays = ECONOMICS_QUESTION_BANK.filter((entry) => entry.topicCode === "2.4" && entry.marks >= 10);
    expect(essays).toHaveLength(7);
    for (const entry of essays) {
      expect(eligible(entry.id, "sl")).toBe(false);
      expect(eligible(entry.id, "hl")).toBe(true);
    }
  });

  it("preserves shared applications that do not demand the neighboring HL extension", () => {
    for (const id of ["econ-v1-2.1-10-001", "econ-v1-2.6-10-003", "econ-v1-3.6-15-001", "econ-v1-4.5-15-001", "econ-v1-4.6-10-001", "econ-v1-4.6-10-003"]) {
      expect(eligible(id, "sl")).toBe(true);
    }
    const demand = extended("econ-v1-2.1-10-001");
    expect(demand.theoryAreas.join(" ")).toContain("willingness and ability");
    expect(JSON.stringify(demand)).not.toMatch(/income and substitution effects|diminishing marginal benefit/i);
    const fiscal = extended("econ-v1-3.6-15-001");
    expect([...fiscal.theoryAreas, ...fiscal.evaluationDirections].join(" ")).not.toMatch(/multiplier|automatic stabilizers/i);
    const depreciation = extended("econ-v1-4.5-15-001");
    expect(depreciation.evaluationDirections.join(" ")).toContain("formal Marshall-Lerner conditions and a J-curve are not required");
    expect(depreciation.evaluationDirections.join(" ")).not.toContain("early deterioration");
  });

  it("retains retired prompts for history while excluding all four unsupported concepts from new SL and HL selection", () => {
    expect(Object.keys(RETIRED_BANK_QUESTIONS)).toHaveLength(27);
    for (const id of ["econ-v1-2.11-2-003", "econ-v1-2.11-10-003", "econ-v1-2.11-15-003", "econ-v1-2.5-2-003"]) {
      expect(question(id).qualityStatus).toBe("deprecated");
      expect(question(id).question).toMatch(/price discrimination|cross-price elasticity/i);
      expect(eligible(id, "sl")).toBe(false);
      expect(eligible(id, "hl")).toBe(false);
    }
    expect(ECONOMICS_QUESTION_BANK.filter((entry) => entry.qualityStatus !== "deprecated")).toHaveLength(371);
    expect(extended("econ-v1-2.5-15-004").theoryAreas.join(" ")).toContain("PED and PES");
    expect(JSON.stringify(extended("econ-v1-2.5-15-004"))).not.toMatch(/\bXED\b/);
    expect(extended("econ-v1-2.11-15-001").evaluationDirections.join(" ")).not.toContain("price discrimination");
  });

  it("distinguishes the opposite curve's elasticity when explaining agricultural price shocks", () => {
    const paths = extended("econ-v1-2.6-15-004").analysisPaths.join(" ");
    expect(paths).toContain("Inelastic supply amplifies the price response to a demand shift");
    expect(paths).toContain("supply shift produces a larger price response when demand is inelastic");
    expect(ESSAY_DIAGRAM_AUDIT["econ-v1-2.6-15-004"]).toMatchObject({
      role: "necessary_for_task", family: "demand_supply",
    });
  });

  it("suggests an optional poverty-cycle mechanism for microfinance without requiring a diagram", () => {
    expect(ESSAY_DIAGRAM_AUDIT["econ-v1-4.10-10-002"]).toMatchObject({
      role: "optional_appropriate", family: "poverty_cycle",
    });
  });

  it("accepts complete determinant and numerical-trade reasoning without prescribing a diagram", () => {
    expect(ESSAY_DIAGRAM_AUDIT["econ-v1-2.5-10-001"].role).toBe("optional_appropriate");
    expect(ESSAY_DIAGRAM_AUDIT["econ-v1-4.1-10-001"].role).toBe("optional_appropriate");
    expect(ESSAY_DIAGRAM_AUDIT["econ-v1-4.1-10-001"].reason).toContain("opportunity-cost table");
  });

  it("rejects standalone AO3-over-AO2 essay demands while preserving a supported integrated growth task", () => {
    const retired = ECONOMICS_QUESTION_BANK.filter((entry) => entry.qualityStatus === "deprecated" && !/price discrimination|cross-price elasticity/i.test(entry.question));
    expect(retired).toHaveLength(23);
    for (const entry of retired) {
      expect(entry.marks).toBe(15);
      expect(eligible(entry.id, "sl")).toBe(false);
      expect(eligible(entry.id, "hl")).toBe(false);
    }
    expect(retired.map((entry) => entry.id)).toContain("econ-v1-4.6-15-003");
    expect(eligible("econ-v1-1.1-15-001", "sl")).toBe(true);
    expect(extended("econ-v1-1.1-15-001").evaluationDirections.join(" ")).toMatch(/distribution.*sustainability/);
  });
});
