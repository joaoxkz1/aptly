import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Assessment, Feedback } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  payloads: [] as { table: string; payload: Record<string, unknown> }[],
}));

const feedback: Feedback = {
  score: 5,
  band: "compatibility",
  strengths: ["Strength"],
  improvements: ["Improve"],
  mistakes: [],
  examinerComment: "Comment",
  studyNext: "Next",
};

const assessment = {
  version: 3,
  gradingProvenance: {
    rubricVersion: "econ-v4",
    taxonomyVersion: "economics-2022-v1",
    gradingContractVersion: "ib-econ-2026-v1",
    modelId: "gpt-5.6-terra",
    reasoningEffort: "medium",
  },
  assessmentFormat: "paper_1_a",
  paper: "paper_1",
  questionPart: "a",
  levelRelevance: "shared_sl_hl",
  assessmentSkills: ["economic_analysis"],
  commandTerm: "explain",
  commandTermLabel: "Explain",
  syllabusUnit: "unit_2",
  syllabusTopic: "2.4",
  topicLabel: "Critique of the maximizing behaviour of consumers and producers",
  classificationConfidence: "high",
  markingConfidence: "high",
  marksAvailable: 10,
  marksAssessable: 10,
  marksEarned: 7,
  unassessedMarks: 0,
  marksSource: "explicit_in_question",
  markDisplayMode: "exact_estimate",
  evidenceSplitSource: "not_specified",
  unassessedEvidence: null,
  practiceLevelLow: 5,
  practiceLevelHigh: 5,
  practiceLevelConfidence: "high",
  diagramExpected: false,
  diagramSubmitted: false,
  diagramAssessmentStatus: "not_relevant",
  workingsExpected: false,
  workingsSubmitted: false,
  workingsAssessmentStatus: "not_relevant",
  attachmentContent: "none",
  markBreakdown: [
    { label: "Economic analysis", awarded: 3, available: 4, reason: "Strong" },
  ],
  limitations: [],
  scoringState: "marked",
  markTotalSource: "explicit",
  recognizedTemplate: null,
  eligibleForCoreAnalytics: true,
  framework: "paper1a_10_mark",
} as Assessment;

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({
    from: (table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        mocks.payloads.push({ table, payload });
        return {
          select: () => ({
            single: async () => {
              if (table === "attempts") {
                return {
                  error: null,
                  data: {
                    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    created_at: "2026-08-10T12:00:00.000Z",
                    subject: "Economics",
                    topic: "Economics",
                    question: "Explain. [10 marks]",
                    answer: "Answer",
                    score: 5,
                    max_score: 7,
                    feedback,
                    mistake_type: null,
                    next_step: "Next",
                    assessment,
                    parent_attempt_id: null,
                    practice_question_id: null,
                    source_material: null,
                    diagram_evidence: null,
                  },
                };
              }
              return {
                error: null,
                data: {
                  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                  created_at: "2026-08-10T12:00:00.000Z",
                  question: "Explain. [10 marks]",
                  source_material: null,
                  framework: "paper1a_10_mark",
                  mark_total: 10,
                  topic_code: "2.4",
                  topic_label: "Critique of the maximizing behaviour of consumers and producers",
                  taxonomy_version: "economics-2022-v1",
                  skill: "economic_analysis",
                  why: "Current focus",
                },
              };
            },
          }),
        };
      },
    }),
  }),
}));

import { saveGradeAttempt, savePracticeQuestion } from "./server-authority";

beforeEach(() => {
  mocks.payloads.length = 0;
});

describe("server-authoritative econ-v4 persistence", () => {
  it("persists all five attempt provenance columns from Assessment JSON", async () => {
    await saveGradeAttempt(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      {
        subject: "Economics",
        topic: "Economics",
        question: "Explain. [10 marks]",
        answer: "Answer",
        feedback,
        assessment,
        parentAttemptId: null,
        practiceQuestionId: null,
        sourceMaterial: null,
      }
    );
    const payload = mocks.payloads[0].payload;
    expect(payload).toMatchObject({
      rubric_version: "econ-v4",
      taxonomy_version: "economics-2022-v1",
      grading_contract_version: "ib-econ-2026-v1",
      grading_model_id: "gpt-5.6-terra",
      grading_reasoning_effort: "medium",
    });
    expect(payload).not.toHaveProperty("model_id");
    expect(payload).not.toHaveProperty("reasoning_effort");
  });

  it("server-stamps current taxonomy on every new practice row", async () => {
    const saved = await savePracticeQuestion(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      {
        question: "Explain. [10 marks]",
        sourceMaterial: null,
        framework: "paper1a_10_mark",
        markTotal: 10,
        topicCode: "2.4",
        topicLabel: "Critique of the maximizing behaviour of consumers and producers",
        skill: "economic_analysis",
        why: "Current focus",
        questionOrigin: "curated_bank",
        bankQuestionId: "econ-v1-2.4-10-001",
        questionBankVersion: "economics-question-bank-v1",
        gradingBlueprint: {
          kind: "extended",
          theoryAreas: ["Consumer behaviour"],
          analysisPaths: ["Explain bounded rationality"],
          applicationExpectations: ["Examples optional"],
          evaluationDirections: ["Evaluation not required"],
          validAlternativeApproaches: ["Credit valid alternatives"],
          commonMisconceptions: ["Consumers always optimize"],
          diagramPolicy: "Not required",
          notes: ["Non-exhaustive"],
        },
        gradingBlueprintVersion: "economics-grading-blueprint-v1",
        levelRelevance: "shared_sl_hl",
        commandTerm: "explain",
        targetSkills: ["economic_analysis"],
        angleTags: ["bounded_rationality"],
        fromCurrentFocus: true,
        requestFingerprint: "a".repeat(64),
      }
    );
    expect(mocks.payloads[0].payload.taxonomy_version).toBe("economics-2022-v1");
    expect(saved.taxonomyVersion).toBe("economics-2022-v1");
    expect(mocks.payloads[0].payload.grading_blueprint).toMatchObject({
      kind: "extended",
    });
  });
});
