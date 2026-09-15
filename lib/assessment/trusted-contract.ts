import "server-only";
import type { AssessmentFramework, LevelRelevance } from "@/lib/types";
import type { EconomicsGradingBlueprint } from "./question-bank/economics-v1/types";
import { FOUR_MARK_BLUEPRINT_VERSION, ESSAY_BLUEPRINT_VERSION } from "./question-bank/economics-v1/types";
import { DIAGRAM_CONTRACT_VERSION, type DiagramFamily, type DiagramTaskCriteria, type PublicAssessmentContract } from "./diagram-contract";
import type { ScoringPolicy } from "./policy";
import { hasUsableSourceMaterial } from "./policy";
import { ESSAY_DIAGRAM_AUDIT } from "./question-bank/economics-v1/essay-diagram-audit";

export interface TrustedAssessmentContract extends PublicAssessmentContract {
  framework: AssessmentFramework;
  paper: string | null;
  part: string | null;
  total: number;
  topic: string;
  syllabusVersion: "economics-2022-v1";
  level: LevelRelevance;
  blueprintVersion: string;
  diagram: DiagramTaskCriteria | null;
  writtenCriteria: string[];
  sourceRequired: boolean;
  scope: "same_question_part";
}

export function diagramAssessmentEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DIAGRAM_ASSESSMENT_ENABLED === "true";
}

/** Only this projection may cross the browser boundary. */
export function publicContract(c: TrustedAssessmentContract): PublicAssessmentContract {
  return { version: c.version, mode: c.mode, diagramRole: c.diagramRole, diagramReason: c.diagramReason, provenance: c.provenance };
}

export function namedDiagramFamily(question: string): DiagramFamily | null {
  const families: [RegExp, DiagramFamily][] = [
    [/poverty.*cycle|cycle.*poverty/i, "poverty_cycle"], [/circular.flow/i, "circular_flow"],
    [/lorenz/i, "lorenz"], [/phillips/i, "phillips"], [/money.market/i, "money_market"],
    [/exchange.rate|currency|foreign.exchange/i, "currency"], [/tariff|quota|trade.protection|world.price/i, "trade"],
    [/externalit|social.cost|social.benefit/i, "externality"], [/monopol|oligopol|marginal.cost|average.cost|cost.and.revenue|perfect.competition/i, "cost_revenue"],
    [/aggregate.demand|aggregate.supply|AD[\s/–-]*AS|output.gap|inflationary.gap|recessionary.gap/i, "ad_as"],
    [/production.possibility|production.possibilities|\bPPC\b|\bPPF\b/i, "ppc"], [/demand.and.supply|supply.and.demand|equilibrium.price|price.ceiling|price.floor|indirect.tax|subsid/i, "demand_supply"],
  ];
  return families.find(([pattern]) => pattern.test(question))?.[1] ?? null;
}

/** Original Aptly practice estimates, never claimed to be an official allocation. */
function inferredDiagram(question: string, family: DiagramFamily): DiagramTaskCriteria {
  return {
    family, acceptableAlternatives: ["Accept a coherent theoretically valid alternative mechanism satisfying the task and supplied context."],
    labels: ["Use the labels identifying the economic variables and relationships requested in the question; conventional abbreviations are acceptable."],
    relationships: [`Judge only the economic relationships requested by this task: ${question}`],
    outcomes: ["The outcome must follow from the diagram and match the explanation of the selected question part."], essentialAreas: [],
    diagram: { zero: "No creditworthy relevant economic relationship is visible.", one: "A relevant relationship or initial model is correct, but the task's change or outcome is materially incomplete or wrong.", two: "The relevant model, change and outcome are correct and identifiable for the exact task, allowing equivalent notation." },
    explanation: { zero: "No correct relevant causal link is explained.", one: "One relevant causal link is correct but the mechanism or resulting outcome is incomplete.", two: "A developed, context-compatible causal chain explains the requested outcome; apply same-part error carry forward without repeating its root-error penalty." },
    contextConstraints: ["Use only context actually supplied. Do not invent missing stimulus."],
    permittedMechanisms: ["Any theoretically valid mechanism that answers this task and fits its supplied context."],
    rules: ["within_part_ecf", "mechanism_consistency_2", "question_label_ceiling_3"],
    labelingRuleReason: "This inferred Paper 2-style practice contract applies the 3/4 maximum for incorrect essential labels. Use the task's diagram family and accepted equivalent notation; do not penalize optional labels or subtract the same weakness twice.",
  };
}

export function resolveAssessmentContract(input: {
  policy: ScoringPolicy; question: string; topic: string; sourceMaterial: string | null;
  blueprint?: EconomicsGradingBlueprint | null; blueprintVersion?: string; level?: LevelRelevance;
  bankQuestionId?: string | null;
}): TrustedAssessmentContract | null {
  const { policy, question, blueprint } = input;
  if (policy.total == null || policy.scoringState === "feedback_only") return null;
  const authored = blueprint?.kind === "four_mark";
  const sourceRequired = policy.framework === "paper2g_15_mark" || policy.framework === "paper3b_10_mark" || /\b(?:text|paragraph|table|extract)\s+(?:[A-Z]|\d+)\b|(?:above|below).*(?:table|data)|according to the (?:text|source)/i.test(question);
  if (sourceRequired && !hasUsableSourceMaterial(input.sourceMaterial)) throw new Error("contract_context_required");
  const audited = blueprint?.kind === "extended" ? blueprint.diagramRequirement ?? (input.bankQuestionId ? ESSAY_DIAGRAM_AUDIT[input.bankQuestionId] : undefined) : undefined;
  const family = audited ? audited.family : namedDiagramFamily(question);
  const split = policy.total === 4 && (authored ? blueprint.format === "diagram_explanation" : policy.markingMethod === "template_component");
  if (split && !authored && family == null) throw new Error("diagram_family_unsupported");
  const explicit = /\b(?:using|draw|sketch|with the aid of|refer to|use)\b[^.?!]{0,90}\b(?:diagram|graph|curve)\b/i.test(question);
  const holistic = policy.total === 10 || policy.total === 15;
  // These task demands need a graphical relationship even without the literal word diagram.
  // Paper 2(g) remains best-fit: there is never a mandatory diagram gate to its top level.
  const necessary = holistic && policy.framework !== "paper2g_15_mark" && (audited ? audited.role === "necessary_for_task" : family != null &&
    /\b(?:explain|analyse|analyze|effect|impact|determin|change|equilibrium|welfare|efficien|output|price|quantity)\b/i.test(question));
  const role = split || explicit ? "required_explicitly" : necessary ? "necessary_for_task" : holistic ? "optional_appropriate" : "not_assessed";
  const reason = split ? "This task asks for a diagram and explanation, assessed as two components out of 2."
    : explicit ? "The question explicitly requests a diagram; its accuracy and explanatory use are judged within the existing framework."
    : audited && policy.framework !== "paper2g_15_mark" ? audited.reason
    : necessary ? `The task asks for economic changes or relationships represented by ${family!.replaceAll("_", " ")}; the diagram's contribution is judged holistically.`
    : holistic ? (policy.framework === "paper2g_15_mark" ? "Diagrams may support this source-based argument. Its highest level can be reached without diagrams when the other descriptors are met." : "Use a diagram where it develops a relevant argument; this task has no fixed diagram allocation.")
    : "This written task does not assess a diagram.";
  return {
    version: DIAGRAM_CONTRACT_VERSION,
    mode: split ? "four_mark_diagram" : policy.total === 4 ? "four_mark_written" : holistic ? "holistic_diagram" : "not_assessed",
    diagramRole: role, diagramReason: reason, provenance: authored || audited ? "aptly_authored" : "inferred_practice",
    framework: policy.framework, paper: authored || policy.framework === "generic_practice" ? null : policy.framework.match(/^paper(\d)/)?.[1] ?? null,
    part: authored ? null : ({ paper1a_10_mark: "a", paper1b_15_mark: "b", paper2g_15_mark: "g", paper3b_10_mark: "b" } as Partial<Record<AssessmentFramework,string>>)[policy.framework] ?? null,
    total: policy.total, topic: input.topic, syllabusVersion: "economics-2022-v1", level: input.level ?? "unknown",
    blueprintVersion: input.blueprintVersion ?? (authored ? FOUR_MARK_BLUEPRINT_VERSION : audited ? ESSAY_BLUEPRINT_VERSION : "inferred-question-contract-v2"),
    diagram: split ? authored ? blueprint.diagramCriteria : inferredDiagram(question, family!) : family != null && holistic ? inferredDiagram(question, family) : null,
    writtenCriteria: authored ? blueprint.writtenCriteria : ["Credit the exact command demand, causal reasoning and supplied context, accepting valid alternatives. No universal four-mark essay rubric; no evaluation, conclusion or outside example unless this task asks for it."],
    sourceRequired, scope: "same_question_part",
  };
}

export function policyWithContract(policy: ScoringPolicy, contract: TrustedAssessmentContract): ScoringPolicy {
  return {
    ...policy, assessmentContract: contract,
    assessable: policy.total, cappedDiagramMarks: 0, capReason: null,
    markingMethod: contract.mode === "four_mark_diagram" ? "template_component" : contract.mode === "four_mark_written" ? "analytic" : policy.markingMethod,
    // An inferred manual allocation is a practice estimate, even with an explicit total.
    scoringState: contract.mode === "four_mark_diagram" && contract.provenance === "inferred_practice" ? "provisional" : policy.scoringState,
  };
}
