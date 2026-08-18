import "server-only";
import { UNIT_1_QUESTIONS } from "./unit-1";
import { UNIT_2_QUESTIONS } from "./unit-2";
import { UNIT_3_QUESTIONS } from "./unit-3";
import { UNIT_4_QUESTIONS } from "./unit-4";
import type { EconomicsBankQuestion, GeneratorMarkTotal } from "./types";

export {
  ECONOMICS_GRADING_BLUEPRINT_VERSION,
  ECONOMICS_QUESTION_BANK_VERSION,
} from "./types";
export type {
  EconomicsBankQuestion,
  EconomicsGradingBlueprint,
  GeneratorMarkTotal,
  QuestionOrigin,
} from "./types";

export const ECONOMICS_QUESTION_BANK: readonly EconomicsBankQuestion[] = Object.freeze([
  ...UNIT_1_QUESTIONS,
  ...UNIT_2_QUESTIONS,
  ...UNIT_3_QUESTIONS,
  ...UNIT_4_QUESTIONS,
]);

export interface TopicCoverageRow {
  topicCode: string;
  twoMark: number;
  tenMark: number;
  fifteenMark: number;
  total: number;
  sharedSlHl: number;
  hlOnly: number;
}
export function questionBankCoverage(
  bank: readonly EconomicsBankQuestion[] = ECONOMICS_QUESTION_BANK
): TopicCoverageRow[] {
  const rows = new Map<string, TopicCoverageRow>();
  for (const question of bank) {
    const row = rows.get(question.topicCode) ?? {
      topicCode: question.topicCode,
      twoMark: 0,
      tenMark: 0,
      fifteenMark: 0,
      total: 0,
      sharedSlHl: 0,
      hlOnly: 0,
    };
    const markKey: Record<GeneratorMarkTotal, "twoMark" | "tenMark" | "fifteenMark"> = {
      2: "twoMark",
      10: "tenMark",
      15: "fifteenMark",
    };
    row[markKey[question.marks]] += 1;
    row.total += 1;
    if (question.levelRelevance === "hl_only") row.hlOnly += 1;
    else row.sharedSlHl += 1;
    rows.set(question.topicCode, row);
  }
  return [...rows.values()].sort((a, b) =>
    a.topicCode.localeCompare(b.topicCode, undefined, { numeric: true })
  );
}
