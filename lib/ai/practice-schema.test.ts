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
    taxonomyVersion: "economics-2022-v1",
    courseLevel: "sl",
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
    topicCode: "3.5", taxonomyVersion: "economics-2022-v1", marks: 15,
    framework: "paper1b_15_mark", paper: "paper_1", questionPart: "b",
    levelRelevance: "shared_sl_hl", requiresSource: false, diagramDependent: false, origin: "adaptive_generated",
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

  it.each(["Price discrimination", "Cross-price elasticity", "XED"])("rejects retired syllabus content %s in generated guidance", concept => {
    expect(() => validateGeneratedPractice(generated({ gradingBlueprint: blueprintFields({ theoryAreas: [concept] }) }), target()))
      .toThrow("content outside current syllabus");
  });

  it("rejects the source question even when casing, punctuation or mark formatting differ", () => {
    const original = generated().question;
    expect(() => validateGeneratedPractice(generated(), target({ evidenceQuestion: original }))).toThrow();
    expect(() => validateGeneratedPractice(generated(), target({
      evidenceQuestion: original.toUpperCase().replace(". [15 MARKS]", "!"),
    }))).toThrow();
    expect(validateGeneratedPractice(generated(), target({
      evidenceQuestion: "Using real-world examples, evaluate a central bank's response to falling aggregate demand. [15 marks]",
    })).question).toBe(original);
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
        marks: 2, framework: "paper2_short_analytic", paper: "paper_2", questionPart: "a",
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
describe("focused output identity and task validation", () => {
  it.each([
    { topicCode: "2.8" }, { taxonomyVersion: "economics-legacy-v3" },
    { marks: 10 }, { framework: "paper2g_15_mark" }, { paper: "paper_3" }, { questionPart: "a" },
    { levelRelevance: "hl_only" }, { requiresSource: true }, { diagramDependent: true },
    { origin: "curated_bank" }, { targetSkills: ["economic_analysis"] },
    { targetSkills: ["evaluation", "calculation"] },
    { gradingBlueprint: blueprintFields({ analysisPaths: [] }) },
    { question: "Calculate the inflation rate and evaluate monetary policy. [15 marks]" },
    { question: "Using the extract, evaluate monetary policy. [15 marks]" },
  ])("rejects incompatible generated metadata/task: %j", (invalid) => {
    expect(() => validateGeneratedPractice(generated(invalid), target())).toThrow();
  });
  it("requires an actual application task, not only a skill tag", () => {
    expect(() => validateGeneratedPractice(generated({ question: "Evaluate monetary policy effectiveness. [15 marks]" }), target({ targetSkill: "application" }))).toThrow("application");
    expect(validateGeneratedPractice(generated(), target({ targetSkill: "application" })).targetSkills).toContain("application");
  });
  it("rejects unsupported trusted targets rather than squeezing them into essays", () => {
    expect(() => validateGeneratedPractice(generated(), target({ targetSkill: "data_interpretation" }))).toThrow("unsupported target");
    expect(() => validateGeneratedPractice(generated(), target({ framework: "paper1a_10_mark" }))).toThrow("unsupported target");
  });
});
describe("adaptive generation prompt", () => {
  it("supplies a bounded evaluative scope and makes cross-topic demands explicit", () => {
    const monetary = buildPracticeUserInput(target());
    expect(monetary).toContain("TRUSTED AO3 GENERATION SCOPE (direct)");
    expect(monetary).toContain("transmission constraints");
    const pes = buildPracticeUserInput(target({ topicCode: "2.6" }));
    expect(pes).toContain("TRUSTED AO3 GENERATION SCOPE (cross)");
    expect(pes).toContain("2.7 policy and stakeholder evaluation");
    expect(pes).toContain("explicit in the question");
  });

  it("requires the HL frame for the supported 4.6 essay scope", () => {
    const hlTarget = target({ topicCode: "4.6", courseLevel: "hl", levelRelevance: "hl_only" });
    expect(buildPracticeUserInput(hlTarget)).toContain("persistent current-account");
    expect(buildPracticeUserInput(hlTarget)).toContain("Course relevance: hl_only");
    expect(() => buildPracticeUserInput({ ...hlTarget, levelRelevance: "shared_sl_hl" })).toThrow("unsupported 15-mark generation scope");
    expect(() => buildPracticeUserInput(target({ topicCode: "4.6" }))).toThrow("unsupported 15-mark generation scope");
  });

  it("fails closed for unsupported essay prompts but leaves explanatory formats available", () => {
    expect(() => buildPracticeUserInput(target({ topicCode: "2.1" }))).toThrow("unsupported 15-mark generation scope");
    expect(buildPracticeUserInput(target({ topicCode: "2.1", markTotal: 10, framework: "paper1a_10_mark", targetSkill: "economic_analysis" })))
      .not.toContain("TRUSTED AO3 GENERATION SCOPE");
  });

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
