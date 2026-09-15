import "server-only";
import { UNIT_1_QUESTIONS } from "./unit-1";
import { UNIT_2_QUESTIONS } from "./unit-2";
import { UNIT_3_QUESTIONS } from "./unit-3";
import { UNIT_4_QUESTIONS } from "./unit-4";
import { FOUR_MARK_QUESTIONS } from "./four-mark";
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

// Keep stable historical IDs readable; exclude these retired syllabus topics
// from current selection without rewriting any saved question or assessment.
export const RETIRED_BANK_QUESTIONS: Readonly<Record<string, string>> = Object.freeze({
  "econ-v1-2.11-2-003": "Price discrimination is outside the October 2022 amended syllabus.",
  "econ-v1-2.11-10-003": "Price discrimination is outside the October 2022 amended syllabus.",
  "econ-v1-2.11-15-003": "Price discrimination is outside the October 2022 amended syllabus.",
  "econ-v1-2.5-2-003": "Cross-price elasticity is outside the October 2022 amended syllabus.",
  "econ-v1-1.1-15-002": "Its evaluative demand exceeds the tested AO2 outcome; see docs/essay-source-audit.md.",
  "econ-v1-1.2-15-001": "Its evaluative demand exceeds the tested AO2 outcome; see docs/essay-source-audit.md.",
  "econ-v1-1.2-15-002": "Its evaluative demand exceeds the tested AO2 outcome; see docs/essay-source-audit.md.",
  "econ-v1-2.1-15-001": "Its evaluative demand exceeds the tested AO2 outcome; see docs/essay-source-audit.md.",
  "econ-v1-2.1-15-002": "Its evaluative demand exceeds the tested AO2 outcome; see docs/essay-source-audit.md.",
  "econ-v1-2.1-15-003": "Its evaluative demand exceeds the tested AO2 outcome; see docs/essay-source-audit.md.",
  "econ-v1-2.2-15-001": "Its evaluative demand exceeds the tested AO2 outcome; see docs/essay-source-audit.md.",
  "econ-v1-2.2-15-002": "Its evaluative demand exceeds the tested AO2 outcome; see docs/essay-source-audit.md.",
  "econ-v1-2.2-15-003": "Its evaluative demand exceeds the tested AO2 outcome; see docs/essay-source-audit.md.",
  "econ-v1-2.3-15-002": "Its evaluative demand exceeds the tested AO2 outcome; see docs/essay-source-audit.md.",
  "econ-v1-2.3-15-003": "Its evaluative demand exceeds the tested AO2 outcome; see docs/essay-source-audit.md.",
  "econ-v1-2.3-15-004": "Its evaluative demand exceeds the tested AO2 outcome; see docs/essay-source-audit.md.",
  "econ-v1-2.5-15-003": "Its evaluative demand exceeds the tested AO2 outcome; see docs/essay-source-audit.md.",
  "econ-v1-2.6-15-001": "Its evaluative demand exceeds the tested AO2 outcome; see docs/essay-source-audit.md.",
  "econ-v1-2.6-15-002": "Its evaluative demand exceeds the tested AO2 outcome; see docs/essay-source-audit.md.",
  "econ-v1-2.6-15-004": "Its evaluative demand exceeds the tested AO2 outcome; see docs/essay-source-audit.md.",
  "econ-v1-2.9-15-003": "Its evaluative demand exceeds the tested AO2 outcome; see docs/essay-source-audit.md.",
  "econ-v1-2.9-15-004": "Its evaluative demand exceeds the tested AO2 outcome; see docs/essay-source-audit.md.",
  "econ-v1-3.1-15-004": "Its evaluative demand exceeds the tested AO2 outcome; see docs/essay-source-audit.md.",
  "econ-v1-3.3-15-003": "Its evaluative demand exceeds the tested AO2 outcome; see docs/essay-source-audit.md.",
  "econ-v1-4.1-15-001": "Its evaluative demand exceeds the tested AO2 outcome; see docs/essay-source-audit.md.",
  "econ-v1-4.7-15-004": "Its evaluative demand exceeds the tested AO2 outcome; see docs/essay-source-audit.md.",
  "econ-v1-4.6-15-003": "Its evaluative demand exceeds the tested AO2 outcome; see docs/essay-source-audit.md.",
});
export const ECONOMICS_QUESTION_BANK: readonly EconomicsBankQuestion[] = Object.freeze([
  ...UNIT_1_QUESTIONS,
  ...UNIT_2_QUESTIONS,
  ...UNIT_3_QUESTIONS,
  ...UNIT_4_QUESTIONS,
  ...FOUR_MARK_QUESTIONS,
].map(question => RETIRED_BANK_QUESTIONS[question.id] ? { ...question, qualityStatus: "deprecated" as const } : question));

export interface TopicCoverageRow {
  topicCode: string;
  twoMark: number;
  fourMark: number;
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
      fourMark: 0,
      tenMark: 0,
      fifteenMark: 0,
      total: 0,
      sharedSlHl: 0,
      hlOnly: 0,
    };
    const markKey: Record<GeneratorMarkTotal, "twoMark" | "fourMark" | "tenMark" | "fifteenMark"> = {
      2: "twoMark",
      4: "fourMark",
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
