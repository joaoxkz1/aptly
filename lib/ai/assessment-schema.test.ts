import { describe, expect, it } from "vitest";
import { buildAssessmentUserInput, validateGradeResult } from "./assessment-schema";
import { resolveScoringPolicy, type PreflightChoice } from "@/lib/assessment/policy";

/**
 * Server marking-frame tests ("server-only" is stubbed for tests in
 * vitest.config.ts). These pin the exact regression case: a multi-part paste
 * where the student selects the 4-mark diagram part can NEVER produce 3/4 or
 * 4/4 with no diagram, and the model is framed to mark the selected part only.
 */

function choice(overrides: Partial<PreflightChoice> = {}): PreflightChoice {
  return {
    requestedSource: null,
    requestedTotal: null,
    templateId: null,
    requestedFramework: null,
    sourceMaterial: null,
    ...overrides,
  };
}

const MULTI_SUBSIDY = [
  "(a) Define a subsidy. [2 marks]",
  "",
  "(b) Using a demand and supply diagram, explain how a subsidy paid to producers affects the equilibrium price and quantity. [4 marks]",
].join("\n");

const TEMPLATE_POLICY = resolveScoringPolicy(
  MULTI_SUBSIDY,
  choice({ requestedSource: "user_confirmed", requestedTotal: 4 })
);

/** A fully valid model output for the 4-mark written-only frame. */
function modelOutput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    score: 5,
    strengths: ["Clear causal chain from costs to supply to equilibrium."],
    improvements: ["State the new equilibrium explicitly."],
    mistakes: [],
    examinerComment: "An accurate written explanation of the subsidy mechanism.",
    studyNext: "Practise pairing this explanation with a labelled diagram.",
    assessmentFormat: "paper_2_c_to_f_diagram_and_explanation",
    paper: "paper_2",
    questionPart: "b",
    levelRelevance: "shared_sl_hl",
    assessmentSkills: ["economic_analysis", "diagram_explanation"],
    commandTerm: "explain",
    commandTermLabel: "Explain",
    syllabusUnit: "unit_2",
    syllabusTopic: "2.5",
    topicLabel: "Government intervention",
    classificationConfidence: "high",
    markingConfidence: "high",
    practiceLevelLow: 4,
    practiceLevelHigh: 5,
    practiceLevelConfidence: "medium",
    diagramExpected: true,
    diagramSubmitted: false,
    diagramAssessmentStatus: "not_submitted",
    workingsExpected: false,
    workingsSubmitted: false,
    workingsAssessmentStatus: "not_relevant",
    attachmentContent: "none",
    assessableEarned: 2,
    markBreakdown: [
      { label: "Economic analysis", awarded: 2, available: 2, reason: "Correct causal chain." },
    ],
    limitations: [],
    ...overrides,
  };
}

describe("regression — 4-mark diagram part selected from a multi-part paste", () => {
  it("a fully correct written explanation yields exactly 2/2 written · 2/4 total", () => {
    const { assessment } = validateGradeResult(modelOutput(), {
      hasImageAttachment: false,
      policy: TEMPLATE_POLICY,
    });
    expect(assessment.framework).toBe("generic_practice"); // never "Paper 2"
    expect(assessment.recognizedTemplate).toBe("four_mark_diagram_explain");
    expect(assessment.marksEarned).toBe(2); // written explanation 2 / 2
    expect(assessment.marksAssessable).toBe(2);
    expect(assessment.marksAvailable).toBe(4); // estimated total 2 / 4
    expect(assessment.diagramMarksUnavailable).toBe(2); // diagram 0 / 2, not submitted
    expect(assessment.capReason).toBeTruthy();
    expect(assessment.scoringState).toBe("marked");
    expect(assessment.eligibleForCoreAnalytics).toBe(true);
  });

  it("the total can NEVER become 3/4 or 4/4 with no diagram — validator rejects it", () => {
    for (const impossible of [3, 4]) {
      expect(() =>
        validateGradeResult(modelOutput({ assessableEarned: impossible }), {
          hasImageAttachment: false,
          policy: TEMPLATE_POLICY,
        })
      ).toThrow();
    }
  });

  it("a missing diagram never becomes a recurring mistake", () => {
    const { feedback } = validateGradeResult(
      modelOutput({ mistakes: ["Missing diagram explanation", "Weak definitions"] }),
      { hasImageAttachment: false, policy: TEMPLATE_POLICY }
    );
    expect(feedback.mistakes).not.toContain("Missing diagram explanation");
    expect(feedback.mistakes).toContain("Weak definitions");
  });

  it("the model is framed on the SELECTED part (b), not the whole paste", () => {
    const input = buildAssessmentUserInput(
      "Economics",
      "Economics",
      MULTI_SUBSIDY,
      "A subsidy reduces firms' costs of production...",
      "RUBRIC",
      false,
      TEMPLATE_POLICY,
      null
    );
    expect(input).toContain("selected part being marked");
    expect(input).toContain("demand and supply diagram");
    expect(input).not.toContain("Define a subsidy");
  });

  it("frames the definition as an optional refinement, never the main written loss", () => {
    const input = buildAssessmentUserInput(
      "Economics",
      "Economics",
      MULTI_SUBSIDY,
      "answer",
      "RUBRIC",
      false,
      TEMPLATE_POLICY,
      null
    );
    expect(input).toContain("optional refinement");
    expect(input).toContain("NEVER call a valid written response unmarkable");
  });
});

describe("marking-frame briefs encode framework-specific rules (no universal rubric)", () => {
  function inputFor(question: string, c: PreflightChoice = choice()): string {
    const policy = resolveScoringPolicy(question, c);
    return buildAssessmentUserInput("Economics", "Economics", question, "answer", "RUBRIC", false, policy, c.sourceMaterial);
  }

  it("Paper 2(a): accepts accurate non-word-perfect definitions, no auto-explanation", () => {
    const input = inputFor("Paper 2(a): Define price elasticity of demand. [2 marks]");
    expect(input).toContain("question-specific analytic mini-markscheme");
    expect(input).toContain("differs from a canonical textbook one");
    expect(input).toContain("do NOT require an explanation the question does not ask for");
  });

  it("Paper 2(b)/3(a): analytic, own-figure logic, never a generic 2+2 split", () => {
    for (const q of [
      "Paper 2(b): Calculate the new equilibrium price. [4 marks]",
      "Paper 3(a): Using a demand and supply diagram, explain the effect of the subsidy. [4 marks]",
    ]) {
      const input = inputFor(q);
      expect(input).toContain("own-figure logic");
      expect(input).toContain("NEVER apply a generic written+diagram 2+2 split");
    }
  });

  it("Paper 1(a): best-fit, no evaluation demanded, no fixed diagram allocation", () => {
    const input = inputFor("Paper 1(a): Explain how a subsidy affects the market. [10 marks]");
    expect(input).toContain("IB BEST-FIT judgement");
    expect(input).toContain("NO evaluation demanded");
    expect(input).toContain("NO fixed diagram allocation");
  });

  it("Paper 1(b): best-fit with evaluation and real-world application, diagrams never compulsory", () => {
    const input = inputFor("Paper 1(b): Evaluate the use of tariffs. [15 marks]");
    expect(input).toContain("IB BEST-FIT judgement");
    expect(input).toContain("balanced synthesis and evaluation");
    expect(input).toContain("NEVER universally compulsory");
  });

  it("Paper 2(g) with source: data-use credit only for applied arguments, not restating", () => {
    const input = inputFor(
      "Paper 2(g): Discuss the effect of the tariff described in the extract. [15 marks]",
      choice({ sourceMaterial: "Extract: country X raised tariffs by 20% and imports fell 8% in 2023." })
    );
    expect(input).toContain("never for merely restating the stimulus");
    expect(input).toContain("SOURCE MATERIAL");
  });

  it("Paper 3(b) with source: five recommendation strands", () => {
    const input = inputFor(
      "Paper 3(b): Recommend a policy to reduce the unemployment described in the data. [10 marks]",
      choice({ sourceMaterial: "Table: unemployment 9%, inflation 3%, growth 0.4% in the last year." })
    );
    expect(input).toContain("appropriateness of the recommended policy");
    expect(input).toContain("supported final judgement");
  });

  it("generic practice: honest holistic estimate, no paper markscheme assumed", () => {
    const input = inputFor("Discuss whether tariffs improve welfare. [15 marks]");
    expect(input).toContain("paper format is NOT confirmed");
  });
});
