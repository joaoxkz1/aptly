import "server-only";
import type { EconomicsCourseLevel } from "@/lib/assessment/course-level";
import type { AssessmentFramework, AssessmentSkill } from "@/lib/types";
import { ECONOMICS_TAXONOMY_VERSION } from "@/lib/assessment/taxonomy";
import type { EconomicsBankQuestion, GeneratorMarkTotal } from "./types";

export interface BankSelectionTarget {
  marks: GeneratorMarkTotal;
  topicCode: string;
  courseLevel: EconomicsCourseLevel;
  targetSkill?: AssessmentSkill | null;
  framework?: AssessmentFramework;
  /** Strict for verified focus; general selection retains its existing preference. */
  requireSkill?: boolean;
  evidenceQuestion?: string;
}
export interface PracticeBankHistoryItem {
  bankQuestionId: string | null;
  createdAt: string;
}

function stringHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function eligibleBankQuestions(
  bank: readonly EconomicsBankQuestion[],
  target: BankSelectionTarget
): EconomicsBankQuestion[] {
  return bank.filter(
    (question) =>
      question.marks === target.marks &&
      question.taxonomyVersion === ECONOMICS_TAXONOMY_VERSION &&
      question.topicCode === target.topicCode &&
      (target.framework === undefined || question.framework === target.framework) &&
      (!target.requireSkill || (target.targetSkill != null && question.targetSkills.includes(target.targetSkill))) &&
      // Definitions must name a concept present in the student's evidence.
      // A conservative miss goes to AI with that evidence, never a random definition.
      (!target.requireSkill || target.targetSkill !== "definition" || definitionMatchesEvidence(question.question, target.evidenceQuestion)) &&
      (target.courseLevel === "hl" || question.levelRelevance === "shared_sl_hl")
  );
}

function definitionMatchesEvidence(question: string, evidence?: string): boolean {
  if (!evidence) return false;
  const words = question.toLowerCase().replace(/\[.*?\]/g, "").match(/[a-z]+/g) ?? [];
  const stop = new Set(["define", "describe", "distinguish", "between", "the", "a", "an", "of", "and", "or", "in", "is", "what", "meant", "by", "term"]);
  const concepts = words.filter(word => !stop.has(word));
  const normalize = (word: string) => word.replace(/ies$/, "y").replace(/s$/, "");
  const evidenceWords = new Set((evidence.toLowerCase().match(/[a-z]+/g) ?? []).map(normalize));
  return concepts.length > 0 && concepts.every(word => evidenceWords.has(normalize(word)));
}

/** Returns null on true bank exhaustion so the caller may use live fallback. */
export function selectCuratedQuestion(
  bank: readonly EconomicsBankQuestion[],
  target: BankSelectionTarget,
  history: readonly PracticeBankHistoryItem[],
  entropy: string
): EconomicsBankQuestion | null {
  const seen = new Set(
    history.flatMap((item) => (item.bankQuestionId === null ? [] : [item.bankQuestionId]))
  );
  let unseen = eligibleBankQuestions(bank, target).filter((question) => !seen.has(question.id));
  if (unseen.length === 0) return null;

  if (target.targetSkill != null) {
    const skillMatched = unseen.filter((question) =>
      question.targetSkills.includes(target.targetSkill!)
    );
    if (skillMatched.length > 0) unseen = skillMatched;
  }

  const ordered = [...unseen].sort((a, b) => a.id.localeCompare(b.id));
  return ordered[stringHash(entropy) % ordered.length] ?? null;
}
