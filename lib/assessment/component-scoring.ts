import type { ComponentDecision, DiagramEvidenceState } from "./diagram-contract";

export interface ComponentEvaluation {
  diagram: number;
  explanation: number;
  diagramReason: string;
  explanationReason: string;
  /** Optional only for replaying pre-field provider records; new outputs declare it. */
  explanationIssue?: "none" | "missing" | "underdeveloped" | "incorrect";
  incompatibleMechanisms: boolean;
  mismatchEvidence: string;
  labelingDeficiency: boolean;
  labelingEvidence: string;
  rootErrors: ComponentDecision["rootErrors"];
}

/** Integer arithmetic and scoped ceilings only. The provider judges evidence, never policy. */
export function reconcileComponents(
  evaluation: ComponentEvaluation,
  input: { state: DiagramEvidenceState; hasExplanation: boolean; rules: readonly string[]; labelingRuleReason: string | null }
): ComponentDecision {
  for (const n of [evaluation.diagram, evaluation.explanation]) {
    if (!Number.isInteger(n) || n < 0 || n > 2) throw new Error("component marks outside 0..2");
  }
  if (["pending", "unreadable_ambiguous", "processing_failure"].includes(input.state)) throw new Error("essential evidence unavailable");
  const diagram = input.state === "not_provided" || input.state === "no_relevant_diagram" ? 0 : evaluation.diagram;
  const explanation = input.hasExplanation ? evaluation.explanation : 0;
  const rawTotal = diagram + explanation;
  const ceilings: ComponentDecision["ceilings"] = [];
  if (diagram > 0 && explanation > 0 && evaluation.incompatibleMechanisms && input.rules.includes("mechanism_consistency_2")) {
    if (!evaluation.mismatchEvidence.trim()) throw new Error("mismatch requires evidence");
    ceilings.push({ rule: "mechanism_consistency_2", maximum: 2, reason: evaluation.mismatchEvidence });
  }
  if (diagram > 0 && evaluation.labelingDeficiency && input.rules.includes("question_label_ceiling_3") && input.labelingRuleReason) {
    if (!evaluation.labelingEvidence.trim()) throw new Error("label ceiling requires evidence");
    ceilings.push({ rule: "question_label_ceiling_3", maximum: 3, reason: evaluation.labelingEvidence });
  }
  const ids = new Set<string>();
  for (const root of evaluation.rootErrors) {
    if (!root.id.trim() || ids.has(root.id) || !root.diagramEvidence.trim() || !root.explanationEvidence.trim()) throw new Error("invalid root-error relationship");
    if (root.carriedForward && !input.rules.includes("within_part_ecf")) throw new Error("ECF outside scope");
    ids.add(root.id);
  }
  return { diagram, explanation, rawTotal, total: Math.min(rawTotal, ...ceilings.map(c => c.maximum)), ceilings,
    reasons: { diagram: diagram === 0 && input.state === "not_provided" ? "No diagram was submitted." : evaluation.diagramReason,
      explanation: input.hasExplanation ? evaluation.explanationReason : "No written explanation was submitted." }, rootErrors: evaluation.rootErrors };
}
