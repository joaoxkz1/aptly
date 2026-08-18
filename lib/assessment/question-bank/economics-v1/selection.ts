import "server-only";
import type { EconomicsCourseLevel } from "@/lib/assessment/course-level";
import type { AssessmentSkill } from "@/lib/types";
import type { EconomicsBankQuestion, GeneratorMarkTotal } from "./types";

export interface BankSelectionTarget {
  marks: GeneratorMarkTotal;
  topicCode: string;
  courseLevel: EconomicsCourseLevel;
  targetSkill?: AssessmentSkill | null;
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
      question.topicCode === target.topicCode &&
      (target.courseLevel === "hl" || question.levelRelevance === "shared_sl_hl")
  );
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
