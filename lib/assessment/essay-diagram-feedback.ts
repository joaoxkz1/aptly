import type { Assessment, Feedback } from "@/lib/types";
import type { DiagramEvidenceState } from "./diagram-contract";
import type { TrustedAssessmentContract } from "./trusted-contract";

function withoutFalseExemption(text: string): string {
  return text.split(/(?<=[.!?])\s+/).filter(sentence =>
    !/\bno\s+(?:economic\s+)?diagrams?\b[^.!?]{0,120}\b(?:required|necessary|needed|expected)\b|\bdiagrams?\b[^.!?]{0,100}\b(?:not|never)\s+(?:required|necessary|needed|expected)\b/i.test(sentence)
  ).join(" ");
}

/** Evidence/feedback reconciliation only. Never alter the holistic mark or band. */
export function reconcileEssayDiagramFeedback(assessment: Assessment, feedback: Feedback,
  contract: TrustedAssessmentContract, state: DiagramEvidenceState): Feedback {
  if (contract.mode !== "holistic_diagram") return feedback;
  const necessary = ["required_explicitly", "necessary_for_task"].includes(contract.diagramRole);
  const absent = state === "not_provided" || state === "no_relevant_diagram";
  if (!necessary) {
    if (contract.diagramRole === "unresolved") {
      assessment.limitations = [...new Set([...assessment.limitations, contract.diagramReason])];
      return { ...feedback, examinerComment: [withoutFalseExemption(feedback.examinerComment), contract.diagramReason].filter(Boolean).join(" ") };
    }
    return absent ? { ...feedback, mistakes: feedback.mistakes.filter(issue => issue !== "Missing required diagram") } : feedback;
  }
  if (!absent) return feedback;
  const name = contract.essayResolution?.ruleId === "negative-production-externality"
    ? "negative-production-externality (MSC/MPC) diagram"
    : contract.diagram ? `${contract.diagram.family.replaceAll("_", " ")} diagram` : "task-required economic diagram";
  const evidence = state === "not_provided" ? `The necessary ${name} was not submitted.`
    : `The submitted image does not supply the necessary ${name}.`;
  const expectations = contract.diagram?.relationships.join(" ") ?? "Show and explain the economic relationships and outcome requested by this question.";
  const action = `Construct and explain the ${name}. ${expectations}`;
  const meaning = `${evidence} This is an unmet element of holistic best fit, even when the written economics is strong; it has no fixed mark deduction.`;
  if (assessment.bandRationale) assessment.bandRationale = [withoutFalseExemption(assessment.bandRationale), meaning].filter(Boolean).join(" ");
  assessment.limitations = assessment.limitations.map(withoutFalseExemption).filter(Boolean);
  assessment.markBreakdown = [...assessment.markBreakdown.filter(row => row.label !== "Diagram")
    .map(row => ({ ...row, reason: withoutFalseExemption(row.reason) || "See the task-specific diagnostic feedback." })),
    { label: "Diagram", awarded: 0, available: 4, reason: evidence }];
  assessment.assessmentSkills = [...new Set([...assessment.assessmentSkills, "diagram_explanation" as const])];
  return { ...feedback,
    strengths: feedback.strengths.map(withoutFalseExemption).filter(Boolean),
    improvements: [action, ...feedback.improvements.map(withoutFalseExemption).filter(Boolean)].slice(0, 3),
    mistakes: [...new Set([...feedback.mistakes, "Missing required diagram" as const])],
    studyNext: action,
    examinerComment: [withoutFalseExemption(feedback.examinerComment), meaning].filter(Boolean).join(" "),
  };
}
