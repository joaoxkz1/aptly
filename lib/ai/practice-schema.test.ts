import { describe, expect, it } from "vitest";
import {
  WRITTEN_ONLY_DIAGRAM_POLICY,
  type EconomicsGradingBlueprint,
} from "@/lib/assessment/question-bank/economics-v1/types";
import {
  buildPracticeInstructions,
  buildPracticeUserInput,
  validateGeneratedPractice,
  type AdaptivePracticeTarget,
} from "./practice-schema";

function target(
  overrides: Partial<AdaptivePracticeTarget> = {}
): AdaptivePracticeTarget {
  return {
    topicCode: "3.5",
    topicLabel: "Demand management — monetary policy",
    markTotal: 15,
    framework: "paper1b_15_mark",
    levelRelevance: "shared_sl_hl",
    targetSkill: "evaluation",
    ...overrides,
  };
}

function blueprintFields(overrides: Record<string, unknown> = {}) {
  return {
    coreEconomicMeaning: null,
    acceptableAlternativeWording: [],
    distinctionsRequired: [],
    theoryAreas: ["Monetary transmission and aggregate demand."],
    analysisPaths: ["Trace interest rates through consumption and investment."],
    applicationExpectations: ["Use a relevant real-world example."],
    evaluationDirections: ["Judge effectiveness by inflation source and time lags."],
    validAlternativeApproaches: ["Credit other valid policy-transmission analysis."],
    commonMisconceptions: ["Assuming all inflation is demand-pull."],
    notes: ["Non-exhaustive guidance."],
    ...overrides,
  };
}

function generated(overrides: Record<string, unknown> = {}) {
  return {
    question:
      "Using real-world examples, evaluate the effectiveness of monetary policy when inflation is caused by supply shocks. [15 marks]",
    commandTerm: "evaluate",
    targetSkills: ["economic_analysis", "application", "evaluation"],
    angleTags: ["policy_effectiveness", "supply_shock"],
    diagramPolicy: WRITTEN_ONLY_DIAGRAM_POLICY,
    gradingBlueprint: blueprintFields(),
    ...overrides,
  };
}

describe("validateGeneratedPractice — strict adaptive fallback", () => {
  it("accepts a validated extended question and blueprint", () => {
    const result = validateGeneratedPractice(generated(), target());
    expect(result.question).toContain("[15 marks]");
    expect(result.gradingBlueprint.kind).toBe("extended");
  });

  it("requires the exact single trusted mark total and compatible command term", () => {
    expect(() =>
      validateGeneratedPractice(
        generated({ question: "Evaluate monetary policy.", commandTerm: "evaluate" }),
        target()
      )
    ).toThrow();
    expect(() =>
      validateGeneratedPractice(
        generated({
          question: "Evaluate monetary policy effectiveness. [10 marks]",
        }),
        target()
      )
    ).toThrow();
    expect(() =>
      validateGeneratedPractice(generated({ commandTerm: "explain" }), target())
    ).toThrow();
  });

  it("rejects visual, source, calculation and official-paper dependencies", () => {
    for (const question of [
      "Using a diagram, evaluate monetary policy. [15 marks]",
      "Using information from the text, evaluate monetary policy. [15 marks]",
      "From an official IB paper, evaluate monetary policy. [15 marks]",
    ]) {
      expect(() => validateGeneratedPractice(generated({ question }), target())).toThrow();
    }
  });

  it("requires a complete non-exhaustive extended blueprint", () => {
    expect(() =>
      validateGeneratedPractice(
        generated({
          gradingBlueprint: blueprintFields({ validAlternativeApproaches: [] }),
        }),
        target()
      )
    ).toThrow();
  });

  it("accepts the distinct short-definition blueprint shape for 2 marks", () => {
    const result = validateGeneratedPractice(
      generated({
        question: "Define monetary policy. [2 marks]",
        commandTerm: "define",
        targetSkills: ["definition"],
        gradingBlueprint: blueprintFields({
          coreEconomicMeaning:
            "Central-bank action to influence interest rates, credit or money supply.",
          acceptableAlternativeWording: ["Equivalent precise wording is valid."],
          distinctionsRequired: ["Distinguish it from fiscal policy."],
          theoryAreas: [],
          analysisPaths: [],
          applicationExpectations: [],
          evaluationDirections: [],
          validAlternativeApproaches: [],
        }),
      }),
      target({
        markTotal: 2,
        framework: "paper2_short_analytic",
        targetSkill: "definition",
      })
    );
    expect(result.gradingBlueprint.kind).toBe("short");
    expect(
      (result.gradingBlueprint as EconomicsGradingBlueprint & { kind: "short" }).kind
    ).toBe("short");
  });
});
describe("adaptive generation prompt", () => {
  it("pins current topic, marks, level and written-only reliability rules", () => {
    const instructions = buildPracticeInstructions();
    const userInput = buildPracticeUserInput(target());
    expect(instructions).toContain("original");
    expect(instructions).toContain("Never mention the IB");
    expect(instructions).toContain("Never require a source");
    expect(userInput).toContain("3.5");
    expect(userInput).toContain("Mark total: 15");
    expect(userInput).toContain("shared_sl_hl");
  });
});
