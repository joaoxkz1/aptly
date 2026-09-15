/** Public contract vocabulary. Private criteria live only in server-owned blueprints. */
export const DIAGRAM_CONTRACT_VERSION = "economics-diagram-contract-v1" as const;
export const DIAGRAM_FAMILIES = ["demand_supply", "ppc", "ad_as", "externality", "cost_revenue", "trade", "currency", "lorenz", "money_market", "phillips", "poverty_cycle", "circular_flow"] as const;
export type DiagramFamily = (typeof DIAGRAM_FAMILIES)[number];
export type DiagramRole = "required_explicitly" | "necessary_for_task" | "optional_appropriate" | "not_assessed";
export type DiagramEvidenceState = "not_provided" | "pending" | "usable" | "partially_readable" | "unreadable_ambiguous" | "no_relevant_diagram" | "processing_failure";
export type DiagramRuleId = "within_part_ecf" | "mechanism_consistency_2" | "question_label_ceiling_3";
export interface CreditDescriptor { zero: string; one: string; two: string }
export interface DiagramTaskCriteria {
  family: DiagramFamily;
  acceptableAlternatives: string[];
  labels: string[];
  relationships: string[];
  outcomes: string[];
  essentialAreas: string[];
  diagram: CreditDescriptor;
  explanation: CreditDescriptor;
  contextConstraints: string[];
  permittedMechanisms: string[];
  rules: DiagramRuleId[];
  labelingRuleReason: string | null;
}
export interface PublicAssessmentContract {
  version: typeof DIAGRAM_CONTRACT_VERSION;
  mode: "four_mark_diagram" | "four_mark_written" | "holistic_diagram" | "not_assessed";
  diagramRole: DiagramRole;
  diagramReason: string;
  provenance: "aptly_authored" | "inferred_practice";
}
export interface ComponentDecision {
  diagram: number;
  explanation: number;
  rawTotal: number;
  total: number;
  ceilings: { rule: DiagramRuleId; maximum: number; reason: string }[];
  reasons: { diagram: string; explanation: string };
  rootErrors: { id: string; diagramEvidence: string; explanationEvidence: string; carriedForward: boolean }[];
}
export interface AssessedDiagramResult {
  version: 1;
  state: DiagramEvidenceState;
  contract: PublicAssessmentContract;
  componentDecision: ComponentDecision | null;
  observations: { region: string; observation: string; interpretation: string; uncertain: boolean }[];
  summary: string;
  attachmentHashes: string[];
  snapshotId: string;
}
