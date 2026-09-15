import "server-only";
import { detectMarkTotals } from "@/lib/assessment/preflight";
import {
  ECONOMICS_TAXONOMY_VERSION,
  SYLLABUS_TOPICS,
  isCurrentTopLevelHlTopic,
} from "@/lib/assessment/taxonomy";
import type { EconomicsBankQuestion } from "./types";
import { ECONOMICS_QUESTION_BANK_VERSION } from "./types";

const EXPLICIT_VISUAL = /\b(draw|sketch|plot|using|with the aid of|refer to)\b[^.?!]{0,90}\b(diagrams?|graphs?|charts?|figures?)\b/i;
const SOURCE_DEPENDENCY = /\b(using (?:information|data) from|the (?:text|extract|source|table|figure) (?:above|below)|according to the (?:text|extract|source))\b/i;
const OFFICIAL_CLAIM = /\b(official|past[\s-]paper|markscheme|paper\s*3)\b/i;

function nonEmptyStrings(values: unknown): values is string[] {
  return Array.isArray(values) && values.length > 0 && values.every((v) => typeof v === "string" && v.trim() !== "");
}
export interface BankValidationReport {
  valid: boolean;
  errors: string[];
}

export function validateEconomicsQuestionBank(
  bank: readonly EconomicsBankQuestion[]
): BankValidationReport {
  const errors: string[] = [];
  const ids = new Set<string>();
  const texts = new Set<string>();
  const currentTopics = new Set<string>(SYLLABUS_TOPICS.filter((topic) => topic !== "unknown"));

  for (const question of bank) {
    const prefix = question.id || "<missing-id>";
    if (ids.has(question.id)) errors.push(`${prefix}: duplicate id`);
    ids.add(question.id);
    const normalized = question.question.trim().toLowerCase().replace(/\s+/g, " ");
    if (texts.has(normalized)) errors.push(`${prefix}: duplicate question text`);
    texts.add(normalized);

    if (question.bankVersion !== ECONOMICS_QUESTION_BANK_VERSION) errors.push(`${prefix}: bank version`);
    if (question.taxonomyVersion !== ECONOMICS_TAXONOMY_VERSION) errors.push(`${prefix}: taxonomy`);
    if (!currentTopics.has(question.topicCode)) errors.push(`${prefix}: unknown topic`);
    if (![2, 4, 10, 15].includes(question.marks)) errors.push(`${prefix}: unsupported marks`);
    if (question.marks === 2 && question.framework !== "paper2_short_analytic") errors.push(`${prefix}: 2-mark framework`);
    if (question.marks === 10 && question.framework !== "paper1a_10_mark") errors.push(`${prefix}: 10-mark framework`);
    if (question.marks === 15 && question.framework !== "paper1b_15_mark") errors.push(`${prefix}: 15-mark framework`);
    if (question.paper === "paper_1" && question.marks === 2) errors.push(`${prefix}: paper mismatch`);
    if (question.paper === "paper_2" && question.marks !== 2) errors.push(`${prefix}: paper mismatch`);
    if (isCurrentTopLevelHlTopic(question.topicCode) && question.levelRelevance !== "hl_only") errors.push(`${prefix}: HL topic tagged shared`);
    if (question.question.trim() === "") errors.push(`${prefix}: empty question`);
    const detected = detectMarkTotals(question.question);
    if (detected.kind !== "single" || detected.single?.marks !== question.marks) errors.push(`${prefix}: mark label`);
    if (question.marks !== 4 && EXPLICIT_VISUAL.test(question.question)) errors.push(`${prefix}: explicit visual requirement`);
    if (SOURCE_DEPENDENCY.test(question.question) && !question.sourceMaterial?.trim()) errors.push(`${prefix}: source dependency`);
    if (OFFICIAL_CLAIM.test(question.question)) errors.push(`${prefix}: official/source claim`);
    if (!nonEmptyStrings(question.targetSkills) || !nonEmptyStrings(question.angleTags)) errors.push(`${prefix}: missing targeting metadata`);

    const blueprint = question.gradingBlueprint;
    if (question.marks === 2) {
      if (blueprint.kind !== "short") errors.push(`${prefix}: short blueprint kind`);
      else if (
        blueprint.coreEconomicMeaning.trim() === "" ||
        !nonEmptyStrings(blueprint.acceptableAlternativeWording) ||
        !nonEmptyStrings(blueprint.distinctionsRequired) ||
        !nonEmptyStrings(blueprint.commonIncorrectInterpretations) ||
        !nonEmptyStrings(blueprint.notes)
      ) errors.push(`${prefix}: incomplete short blueprint`);
    } else if (question.marks === 4) {
      if (blueprint.kind !== "four_mark" || !question.sourceMaterial?.trim() || question.paper !== "custom" || question.questionPart !== "unknown" || question.gradingBlueprintVersion !== "economics-four-mark-blueprint-v2") errors.push(`${prefix}: four-mark contract metadata`);
      else if (blueprint.format === "diagram_explanation") {
        const d = blueprint.diagramCriteria;
        if (question.framework !== "paper2_four_mark_diagram_explain" || !EXPLICIT_VISUAL.test(question.question) || !d ||
          !nonEmptyStrings(d.labels) || !nonEmptyStrings(d.relationships) || !nonEmptyStrings(d.outcomes) ||
          !nonEmptyStrings(d.acceptableAlternatives) || !nonEmptyStrings(d.contextConstraints) || !nonEmptyStrings(d.permittedMechanisms) ||
          ![d.diagram.zero,d.diagram.one,d.diagram.two,d.explanation.zero,d.explanation.one,d.explanation.two].every(s => s.trim().length > 15) ||
          (d.rules.includes("question_label_ceiling_3") && !d.labelingRuleReason)) errors.push(`${prefix}: incomplete diagram blueprint`);
      } else if (blueprint.format !== "written_explanation" || blueprint.diagramCriteria !== null || question.framework !== "generic_practice" || !nonEmptyStrings(blueprint.writtenCriteria)) errors.push(`${prefix}: incomplete written blueprint`);
    } else {
      if (blueprint.kind !== "extended") errors.push(`${prefix}: extended blueprint kind`);
      else if (
        !nonEmptyStrings(blueprint.theoryAreas) ||
        !nonEmptyStrings(blueprint.analysisPaths) ||
        !nonEmptyStrings(blueprint.applicationExpectations) ||
        !nonEmptyStrings(blueprint.evaluationDirections) ||
        !nonEmptyStrings(blueprint.validAlternativeApproaches) ||
        !nonEmptyStrings(blueprint.commonMisconceptions) ||
        !nonEmptyStrings(blueprint.notes)
      ) errors.push(`${prefix}: incomplete extended blueprint`);
    }
  }
  if (bank.length < 300) errors.push(`bank: expected at least 300 questions, found ${bank.length}`);
  return { valid: errors.length === 0, errors };
}

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/\[[^\]]+\]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 3)
  );
}

export function lexicalNearDuplicates(
  bank: readonly EconomicsBankQuestion[],
  threshold = 0.82
): { first: string; second: string; similarity: number }[] {
  const flagged: { first: string; second: string; similarity: number }[] = [];
  for (let i = 0; i < bank.length; i += 1) {
    const a = tokens(bank[i].question);
    for (let j = i + 1; j < bank.length; j += 1) {
      if (bank[i].topicCode !== bank[j].topicCode || bank[i].marks !== bank[j].marks) continue;
      const b = tokens(bank[j].question);
      const intersection = [...a].filter((token) => b.has(token)).length;
      const union = new Set([...a, ...b]).size;
      const similarity = union === 0 ? 0 : intersection / union;
      if (similarity >= threshold) flagged.push({ first: bank[i].id, second: bank[j].id, similarity });
    }
  }
  return flagged;
}
