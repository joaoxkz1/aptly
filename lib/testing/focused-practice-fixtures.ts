// Test-only saved evidence. No fixture is inserted by application code.
import { SAMPLE_WALKTHROUGH_ATTEMPT } from "@/lib/assessment/sample-walkthrough";
import type { Attempt, MarkBreakdownLabel, SyllabusTopic } from "@/lib/types";

export function focusAttempt(label: MarkBreakdownLabel = "Application to context", topic: SyllabusTopic = "2.8", id = "55555555-5555-4555-8555-555555555555"): Attempt {
  const monetary = topic === "3.5";
  const concept = monetary ? "monetary policy effectiveness" : "negative externalities of production";
  const source = label === "Data use";
  return {
    ...structuredClone(SAMPLE_WALKTHROUGH_ATTEMPT), id, createdAt: "2026-08-18T10:00:00Z",
    question: `Using ${source ? "the supplied data" : "real-world examples"}, evaluate ${monetary ? "the effectiveness of monetary policy in reducing inflation" : "policies to reduce negative externalities of production"}. [15 marks]`,
    sourceMaterial: source ? (monetary ? "Interest rates rose from 2% to 5%. Inflation fell from 8% to 6%, while business investment fell by 4%." : "After an emissions tax, measured factory pollution fell by 12%. Output fell by 3%; local treatment costs fell by 8%.") : null,
    answer: `Policies can change incentives and improve outcomes. Their effectiveness depends on enforcement and economic conditions. This answer about ${concept} needs more developed evidence.`,
    feedback: { score: 4, band: "Practice estimate", strengths: ["Identifies relevant economic incentives."], improvements: [`Develop ${label.toLowerCase()} with specific supporting evidence.`], mistakes: [], examinerComment: `A relevant discussion of ${concept}, with a diagnostic gap in ${label.toLowerCase()}.`, studyNext: `Practise ${label.toLowerCase()} on a fresh question.` },
    assessment: {
      ...structuredClone(SAMPLE_WALKTHROUGH_ATTEMPT.assessment!),
      syllabusTopic: topic, eligibleForCoreAnalytics: true, scoringState: "marked",
      marksAvailable: 15, marksAssessable: 15, marksEarned: 8, framework: source ? "paper2g_15_mark" : "paper1b_15_mark",
      sourceMaterialProvided: source,
      assessmentSkills: source ? ["economic_analysis", "data_interpretation", "application", "evaluation"] : ["economic_analysis", "application", "evaluation"],
      paper: source ? "paper_2" : "paper_1", questionPart: source ? "g" : "b",
      markBreakdown: [{ label, awarded: 1, available: 4, reason: `Develop ${label.toLowerCase()} when discussing ${concept}.` }],
      gradingProvenance: { rubricVersion: "econ-v4", taxonomyVersion: "economics-2022-v1", gradingContractVersion: "ib-econ-2026-v1", modelId: "gpt-5.6-terra", reasoningEffort: "medium" },
    },
  };
}
export function focusHistory(label: MarkBreakdownLabel = "Application to context"): Attempt[] {
  const second = focusAttempt(label, "3.5", "66666666-6666-4666-8666-666666666666");
  second.assessment!.markBreakdown[0].awarded = 3;
  return [focusAttempt(label), second];
}
