import { describe, expect, it } from "vitest";
import {
  GRADE_RESULT_JSON_SCHEMA,
  buildAssessmentInstructions,
  compatibilityScoreFor,
  validateGradeResult,
} from "./assessment-schema";
import {
  policyForGeneratedPractice,
  resolveScoringPolicy,
  type PreflightChoice,
  type ScoringPolicy,
} from "@/lib/assessment/policy";

function choice(): PreflightChoice {
  return {
    requestedSource: null,
    requestedTotal: null,
    templateId: null,
    requestedFramework: null,
    sourceMaterial: null,
  };
}

function output(
  policy: ScoringPolicy,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const marked = policy.assessable != null;
  return {
    strengths: ["Relevant theory is applied to the question."],
    improvements: ["Develop the final judgement from the preceding analysis."],
    mistakes: ["Underdeveloped evaluation"],
    examinerComment: "The response contains accurate theory but evaluation is only partly developed.",
    studyNext: "Practise weighing conditions before reaching a judgement.",
    assessmentFormat: "custom_extended_response",
    paper: "custom",
    questionPart: "unknown",
    levelRelevance: "shared_sl_hl",
    assessmentSkills: ["economic_analysis", "evaluation"],
    commandTerm: "discuss",
    commandTermLabel: "Discuss",
    syllabusUnit: "unit_3",
    syllabusTopic: "3.4",
    topicLabel: "model-controlled label",
    classificationConfidence: "high",
    markingConfidence: "high",
    diagramExpected: false,
    diagramSubmitted: false,
    diagramAssessmentStatus: "not_relevant",
    workingsExpected: false,
    workingsSubmitted: false,
    workingsAssessmentStatus: "not_relevant",
    attachmentContent: "none",
    assessableEarned: marked ? Math.min(7, policy.assessable!) : null,
    markBreakdown: marked
      ? [
          { label: "Economic analysis", awarded: 3, available: 4, reason: "Developed analysis." },
          {
            label: "Evaluation and judgment",
            awarded: 2,
            available: 4,
            reason: "Some evaluation, but limited weighing.",
          },
        ]
      : [],
    bandRationale:
      policy.bestFit && marked
        ? "The relevant theory and analysis fit the band securely, while limited weighing keeps the response away from its upper edge."
        : null,
    limitations: [],
    ...overrides,
  };
}

describe("econ-v4 server-owned grading contract", () => {
  it("places the IB-aligned best-fit examiner process in the developer instructions", () => {
    const instructions = buildAssessmentInstructions();
    expect(instructions).toContain("IB-ALIGNED EXAMINER METHOD");
    expect(instructions).toContain("read the entire answer before fixing a mark");
    expect(instructions).toContain("internal, non-exhaustive question-specific guide");
    expect(instructions).toContain("answer need not satisfy every characteristic");
    expect(instructions).toContain("top mark is attainable");
    expect(instructions).toContain("One strong developed example can be sufficient");
    expect(instructions).toContain("not a mechanical pro/con pair");
    expect(instructions).toContain("Do not require stand-alone textbook definitions unless asked");
    expect(instructions).toContain("not universally required for a high Paper 1(b) or Paper 2(g)");
  });

  it("removes score and practice-level fields from model authority", () => {
    const properties = GRADE_RESULT_JSON_SCHEMA.properties as Record<string, unknown>;
    expect(properties).not.toHaveProperty("score");
    expect(properties).not.toHaveProperty("practiceLevelLow");
    expect(properties).not.toHaveProperty("practiceLevelHigh");
    expect(compatibilityScoreFor(7, 10)).toBe(5);
    const policy = policyForGeneratedPractice({
      framework: "paper1a_10_mark",
      markTotal: 10,
      sourceMaterial: null,
    });
    expect(() =>
      validateGradeResult(output(policy, { score: 7 }), {
        hasImageAttachment: false,
        policy,
      })
    ).toThrow(/unexpected field score/);
  });

  it("server-stamps Paper 3 classification and HL relevance over contradictions", () => {
    const policy = policyForGeneratedPractice({
      framework: "paper3b_10_mark",
      markTotal: 10,
      sourceMaterial: "The supplied text reports inflation rose while output growth slowed sharply.",
    });
    const { assessment } = validateGradeResult(
      output(policy, {
        paper: "paper_1",
        assessmentFormat: "paper_1_a",
        questionPart: "a",
        levelRelevance: "shared_sl_hl",
      }),
      { hasImageAttachment: false, policy }
    );
    expect(assessment).toMatchObject({
      paper: "paper_3",
      assessmentFormat: "paper_3_b_policy_recommendation",
      questionPart: "b",
      levelRelevance: "hl_only",
    });
  });

  it("server-stamps Paper 1(a) classification over contradictory model metadata", () => {
    const policy = policyForGeneratedPractice({
      framework: "paper1a_10_mark",
      markTotal: 10,
      sourceMaterial: null,
    });
    const { assessment } = validateGradeResult(
      output(policy, {
        paper: "paper_2",
        assessmentFormat: "paper_2_g_extended_response",
        questionPart: "g",
      }),
      { hasImageAttachment: false, policy }
    );
    expect(assessment).toMatchObject({
      paper: "paper_1",
      assessmentFormat: "paper_1_a",
      questionPart: "a",
    });
  });

  it("uses current topic authority without falsely making current 3.4 HL-only", () => {
    const policy = policyForGeneratedPractice({
      framework: "paper1a_10_mark",
      markTotal: 10,
      sourceMaterial: null,
    });
    const shared = validateGradeResult(output(policy), {
      hasImageAttachment: false,
      policy,
    }).assessment;
    const hl = validateGradeResult(output(policy, { syllabusTopic: "2.10" }), {
      hasImageAttachment: false,
      policy,
    }).assessment;
    expect(shared.topicLabel).toBe("Economics of inequality and poverty");
    expect(shared.levelRelevance).toBe("shared_sl_hl");
    expect(hl.levelRelevance).toBe("hl_only");
  });

  it("requires the stable /4 diagnostic scale", () => {
    const policy = policyForGeneratedPractice({
      framework: "paper1a_10_mark",
      markTotal: 10,
      sourceMaterial: null,
    });
    for (const available of [3, 5]) {
      expect(() =>
        validateGradeResult(
          output(policy, {
            markBreakdown: [
              { label: "Economic analysis", awarded: 2, available, reason: "Same performance." },
            ],
          }),
          { hasImageAttachment: false, policy }
        )
      ).toThrow(/markBreakdown\.available/);
    }
  });

  it("keeps a Paper 1(b) headline mark and server band independent of /4 diagnostics", () => {
    const policy = policyForGeneratedPractice({
      framework: "paper1b_15_mark",
      markTotal: 15,
      sourceMaterial: null,
    });
    const lowDiagnostics = validateGradeResult(
      output(policy, {
        assessableEarned: 12,
        markBreakdown: [
          { label: "Economic analysis", awarded: 0, available: 4, reason: "Diagnostic A." },
        ],
      }),
      { hasImageAttachment: false, policy }
    ).assessment;
    const highDiagnostics = validateGradeResult(
      output(policy, {
        assessableEarned: 12,
        markBreakdown: [
          { label: "Economic analysis", awarded: 4, available: 4, reason: "Diagnostic B." },
        ],
      }),
      { hasImageAttachment: false, policy }
    ).assessment;
    expect(lowDiagnostics).toMatchObject({
      marksEarned: 12,
      markBand: "10-12",
      markBandLow: 10,
      markBandHigh: 12,
      bandPosition: "upper",
    });
    expect(highDiagnostics).toMatchObject({
      marksEarned: 12,
      markBand: "10-12",
      markBandLow: 10,
      markBandHigh: 12,
      bandPosition: "upper",
    });
  });

  it("does not manufacture feedback-only score, level, or band", () => {
    const policy = resolveScoringPolicy("Explain scarcity.", choice());
    const { feedback, assessment } = validateGradeResult(output(policy), {
      hasImageAttachment: false,
      policy,
    });
    expect(feedback.score).toBeNull();
    expect(feedback.band).toBeNull();
    expect(assessment.practiceLevelLow).toBeNull();
    expect(assessment.practiceLevelHigh).toBeNull();
    expect(assessment.markBand).toBeNull();
  });

  it("stamps exact immutable provenance on every new marked result", () => {
    const policy = policyForGeneratedPractice({
      framework: "paper1b_15_mark",
      markTotal: 15,
      sourceMaterial: null,
    });
    const { assessment } = validateGradeResult(output(policy), {
      hasImageAttachment: false,
      policy,
    });
    expect(assessment.version).toBe(3);
    expect(assessment.gradingProvenance).toEqual({
      rubricVersion: "econ-v4",
      taxonomyVersion: "economics-2022-v1",
      gradingContractVersion: "ib-econ-2026-v1",
      modelId: "gpt-5.6-terra",
      reasoningEffort: "medium",
    });
  });
});
