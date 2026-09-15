import "server-only";
import type { DiagramFamily, DiagramTaskCriteria } from "@/lib/assessment/diagram-contract";
import type { EconomicsBankQuestion, FourMarkGradingBlueprint } from "./types";
import { FOUR_MARK_BLUEPRINT_VERSION } from "./types";

type Credit = readonly [zero: string, one: string, two: string];
interface BaseSeed {
  topic: EconomicsBankQuestion["topicCode"];
  sequence: number;
  hl?: boolean;
  question: string;
  context: string;
  tags: string[];
}
interface DiagramSeed extends BaseSeed {
  family: DiagramFamily;
  labels: string[];
  relationships: string[];
  outcomes: string[];
  diagram: Credit;
  explanation: Credit;
  alternatives: string[];
  mechanisms: string[];
  areas?: string[];
  labelCeilingReason?: string;
}
const provenance: FourMarkGradingBlueprint["reviewProvenance"] = {
  author: "Aptly",
  status: "source_reviewed",
  reviewedAt: "2026-09-15",
  independentlyTeacherValidated: false,
  basis: ["Original Aptly scenario and criteria; not an IB question or markscheme.", "Reviewed against the October 2022 amended Economics guide, indexed official 2026 examiner instructions and comparable IB-authored markschemes. Per-question evidence and decisions: docs/four-mark-source-audit.md."],
};
function base(seed: BaseSeed): Omit<EconomicsBankQuestion, "framework" | "targetSkills" | "diagramPolicy" | "gradingBlueprint"> {
  return {
    id: `econ-v1-${seed.topic}-4-${String(seed.sequence).padStart(3, "0")}`,
    bankVersion: "economics-question-bank-v1",
    question: `${seed.question} [4 marks]`,
    sourceMaterial: seed.context,
    marks: 4,
    taxonomyVersion: "economics-2022-v1",
    topicCode: seed.topic,
    unit: `unit_${seed.topic[0]}` as EconomicsBankQuestion["unit"],
    levelRelevance: seed.hl ? "hl_only" : "shared_sl_hl",
    paper: "custom",
    questionPart: "unknown",
    commandTerm: "explain",
    angleTags: seed.tags,
    gradingBlueprintVersion: FOUR_MARK_BLUEPRINT_VERSION,
    qualityStatus: "curated",
  };
}
function credit([zero, one, two]: Credit) { return { zero, one, two }; }
export function diagramQuestion(seed: DiagramSeed): EconomicsBankQuestion {
  const diagramPolicy = `A submitted ${seed.family.replaceAll("_", " ")} diagram is explicitly required for this original 4-mark practice task; diagram evidence and explanation are each assessed out of 2.`;
  const diagramCriteria: DiagramTaskCriteria = {
    family: seed.family,
    acceptableAlternatives: seed.alternatives,
    labels: seed.labels,
    relationships: seed.relationships,
    outcomes: seed.outcomes,
    essentialAreas: seed.areas ?? [],
    diagram: credit(seed.diagram),
    explanation: credit(seed.explanation),
    contextConstraints: [seed.context],
    permittedMechanisms: seed.mechanisms,
    rules: ["within_part_ecf", "mechanism_consistency_2", "question_label_ceiling_3"],
    labelingRuleReason: seed.labelCeilingReason ?? "This original task adopts the Paper 2-style 2+2 labeling maximum: incorrect essential labels limit the total to 3/4. Judge this family's task-relevant labels, accept equivalent notation, and do not subtract again for an already reduced component.",
  };
  return {
    ...base(seed), framework: "paper2_four_mark_diagram_explain",
    targetSkills: ["diagram_explanation", "economic_analysis", "application"],
    diagramPolicy,
    gradingBlueprint: {
      kind: "four_mark", format: "diagram_explanation", diagramPolicy, diagramCriteria,
      writtenCriteria: [],
      notes: [
        "This is original Aptly practice using a supported 2+2 contract; no actual examination paper or part is claimed.",
        "Within this one part, carry a root error forward into otherwise valid reasoning; assess unrelated errors separately. A separately valid but incompatible mechanism can trigger the overall 2/4 ceiling.",
        "A label ceiling is a maximum, never an extra subtraction. Do not charge one omission in several criteria. Missing arrows alone do not invalidate a direction established by the submitted geometry and explanation.",
        "Accept equivalent notation and economically valid alternatives consistent with the complete supplied context. No evaluation, conclusion or outside example is required.",
      ],
      reviewProvenance: { ...provenance, basis: [...provenance.basis], reviewReference: `docs/four-mark-source-audit.md#econ-v1-${seed.topic}-4-${String(seed.sequence).padStart(3, "0")}` },
    },
  };
}
export function writtenQuestion(seed: BaseSeed & { first: Credit; second: Credit }): EconomicsBankQuestion {
  const diagramPolicy = "This task assesses two written explanations, each out of 2. A diagram is not required and does not earn separate marks.";
  return {
    ...base(seed), framework: "generic_practice", targetSkills: ["economic_analysis", "application"], diagramPolicy,
    gradingBlueprint: {
      kind: "four_mark", format: "written_explanation", diagramPolicy, diagramCriteria: null,
      writtenCriteria: [
        `First explanation (0–2): 0 = ${seed.first[0]} 1 = ${seed.first[1]} 2 = ${seed.first[2]}`,
        `Second explanation (0–2): 0 = ${seed.second[0]} 1 = ${seed.second[1]} 2 = ${seed.second[2]}`,
      ],
      notes: ["Add the two explanation awards to obtain 0–4. Do not credit the same explanation twice; accept equivalent valid reasoning within the stimulus.", "Original written practice; no specific examination-paper mapping is asserted. No diagram, evaluation, conclusion or outside example is required."],
      reviewProvenance: { ...provenance, basis: [...provenance.basis], reviewReference: `docs/four-mark-source-audit.md#econ-v1-${seed.topic}-4-${String(seed.sequence).padStart(3, "0")}` },
    },
  };
}
