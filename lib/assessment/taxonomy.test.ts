import { describe, expect, it } from "vitest";
import type { Assessment, Attempt, EconomicsTaxonomyVersion } from "@/lib/types";
import {
  CURRENT_SYLLABUS_TOPIC_LABELS,
  ECONOMICS_LEGACY_TAXONOMY_VERSION,
  ECONOMICS_TAXONOMY_VERSION,
  isCurrentTopLevelHlTopic,
  resolveEconomicsTaxonomyVersion,
} from "./taxonomy";
import { topicDisplayLabel } from "./display";
import { buildLearningInsights } from "./readiness";

const EXPECTED_CURRENT = {
  "1.1": "What is economics?",
  "1.2": "How do economists approach the world?",
  "2.1": "Demand",
  "2.2": "Supply",
  "2.3": "Competitive market equilibrium",
  "2.4": "Critique of the maximizing behaviour of consumers and producers",
  "2.5": "Elasticity of demand",
  "2.6": "Elasticity of supply",
  "2.7": "Role of government in microeconomics",
  "2.8": "Market failure — externalities and common pool/common access resources",
  "2.9": "Market failure — public goods",
  "2.10": "Market failure — asymmetric information",
  "2.11": "Market failure — market power",
  "2.12": "The market's inability to achieve equity",
  "3.1": "Measuring economic activity and illustrating its variations",
  "3.2": "Variations in economic activity — aggregate demand and aggregate supply",
  "3.3": "Macroeconomic objectives",
  "3.4": "Economics of inequality and poverty",
  "3.5": "Demand management — monetary policy",
  "3.6": "Demand management — fiscal policy",
  "3.7": "Supply-side policies",
  "4.1": "Benefits of international trade",
  "4.2": "Types of trade protection",
  "4.3": "Arguments for and against trade control/protection",
  "4.4": "Economic integration",
  "4.5": "Exchange rates",
  "4.6": "Balance of payments",
  "4.7": "Sustainable development",
  "4.8": "Measuring development",
  "4.9": "Barriers to economic growth and/or economic development",
  "4.10": "Economic growth and/or economic development strategies",
  unknown: "Unclassified topic",
};

function markedAttempt(
  id: string,
  taxonomyVersion: EconomicsTaxonomyVersion | undefined,
  earned: number
): Attempt {
  const gradingProvenance =
    taxonomyVersion == null
      ? undefined
      : {
          rubricVersion: taxonomyVersion === ECONOMICS_TAXONOMY_VERSION ? "econ-v4" : "econ-v3",
          taxonomyVersion,
          gradingContractVersion:
            taxonomyVersion === ECONOMICS_TAXONOMY_VERSION ? "ib-econ-2026-v1" : "legacy",
          modelId: taxonomyVersion === ECONOMICS_TAXONOMY_VERSION ? "gpt-5.6-terra" : "legacy",
          reasoningEffort: taxonomyVersion === ECONOMICS_TAXONOMY_VERSION ? "medium" : "legacy",
        };
  const assessment: Assessment = {
    version: taxonomyVersion === ECONOMICS_TAXONOMY_VERSION ? 3 : 2,
    assessmentFormat: "custom_extended_response",
    paper: "custom",
    questionPart: "unknown",
    levelRelevance: "shared_sl_hl",
    assessmentSkills: ["economic_analysis"],
    commandTerm: "explain",
    commandTermLabel: "Explain",
    syllabusUnit: "unit_2",
    syllabusTopic: "2.4",
    topicLabel: "stored label",
    classificationConfidence: "high",
    markingConfidence: "high",
    marksAvailable: 10,
    marksAssessable: 10,
    marksEarned: earned,
    unassessedMarks: 0,
    marksSource: "explicit_in_question",
    markDisplayMode: "exact_estimate",
    evidenceSplitSource: "not_specified",
    unassessedEvidence: null,
    practiceLevelLow: 4,
    practiceLevelHigh: 4,
    practiceLevelConfidence: "high",
    diagramExpected: false,
    diagramSubmitted: false,
    diagramAssessmentStatus: "not_relevant",
    workingsExpected: false,
    workingsSubmitted: false,
    workingsAssessmentStatus: "not_relevant",
    attachmentContent: "none",
    markBreakdown: [
      { label: "Economic analysis", awarded: 2, available: 4, reason: "partial" },
    ],
    limitations: [],
    gradingProvenance,
    scoringState: "marked",
    markTotalSource: "explicit",
    recognizedTemplate: null,
    eligibleForCoreAnalytics: true,
    framework: "generic_practice",
  };
  return {
    id,
    createdAt: `2026-08-0${id === "legacy" ? 1 : 2}T12:00:00.000Z`,
    subject: "Economics",
    topic: "Economics",
    question: "Explain. [10 marks]",
    answer: "Answer",
    feedback: {
      score: 4,
      band: "compatibility",
      strengths: [],
      improvements: [],
      mistakes: [],
      examinerComment: "Comment",
      studyNext: "Next",
    },
    assessment,
  };
}

describe("versioned Economics taxonomy", () => {
  it("pins the complete current registry exactly", () => {
    expect(CURRENT_SYLLABUS_TOPIC_LABELS).toEqual(EXPECTED_CURRENT);
  });

  it("resolves missing versions as legacy and never relabels historical codes", () => {
    expect(resolveEconomicsTaxonomyVersion(undefined)).toBe(
      ECONOMICS_LEGACY_TAXONOMY_VERSION
    );
    expect(topicDisplayLabel("2.4")).toBe("Elasticities");
    expect(topicDisplayLabel("3.4")).toBe("Fiscal Policy");
  });

  it("uses current meanings for known high-risk codes", () => {
    expect(topicDisplayLabel("2.4", ECONOMICS_TAXONOMY_VERSION)).toBe(
      "Critique of the maximizing behaviour of consumers and producers"
    );
    expect(topicDisplayLabel("3.4", ECONOMICS_TAXONOMY_VERSION)).toBe(
      "Economics of inequality and poverty"
    );
    expect(topicDisplayLabel("4.5", ECONOMICS_TAXONOMY_VERSION)).toBe("Exchange rates");
    expect(topicDisplayLabel("2.9", ECONOMICS_TAXONOMY_VERSION)).toBe(
      "Market failure — public goods"
    );
  });

  it("treats current 2.4 and 2.10–2.12 as top-level HL-only content", () => {
    expect(["2.4", "2.10", "2.11", "2.12"].every(isCurrentTopLevelHlTopic)).toBe(true);
    expect(isCurrentTopLevelHlTopic("3.4")).toBe(false);
    expect(isCurrentTopLevelHlTopic("2.9")).toBe(false);
  });

  it("does not merge the same code across current and legacy analytics", () => {
    const insights = buildLearningInsights([
      markedAttempt("legacy", undefined, 4),
      markedAttempt("current", ECONOMICS_TAXONOMY_VERSION, 8),
    ]);
    expect(insights.topicPerformance).toHaveLength(2);
    expect(
      insights.topicPerformance.map((row) => `${row.taxonomyVersion}:${row.topicCode}`)
    ).toEqual(
      expect.arrayContaining([
        "economics-legacy-v3:2.4",
        "economics-2022-v1:2.4",
      ])
    );
  });
});
