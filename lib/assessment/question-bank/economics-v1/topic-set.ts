import "server-only";
import type { CommandTerm, LevelRelevance, SyllabusTopic } from "@/lib/types";
import { fifteenMarkQuestion, shortQuestion, tenMarkQuestion } from "./builders";
import type { EconomicsBankQuestion } from "./types";

type TopicCode = Exclude<SyllabusTopic, "unknown">;
type Level = Exclude<LevelRelevance, "unknown">;

export type ShortSeed = readonly [
  commandTerm: Extract<CommandTerm, "define" | "describe" | "distinguish">,
  question: string,
  meaning: string,
  misconception: string,
  angleTags: readonly string[],
  levelRelevance?: Level,
];

export type TenSeed = readonly [
  commandTerm: Extract<CommandTerm, "explain" | "analyse">,
  question: string,
  theoryArea: string,
  analysisPath: string,
  misconception: string,
  angleTags: readonly string[],
  levelRelevance?: Level,
];

export type FifteenSeed = readonly [
  commandTerm: Extract<CommandTerm, "discuss" | "evaluate" | "examine" | "to_what_extent">,
  question: string,
  theoryArea: string,
  analysisPath: string,
  evaluationDirection: string,
  misconception: string,
  angleTags: readonly string[],
  levelRelevance?: Level,
];

export function topicQuestionSet(input: {
  topicCode: TopicCode;
  levelRelevance: Level;
  short: readonly ShortSeed[];
  ten: readonly TenSeed[];
  fifteen: readonly FifteenSeed[];
}): EconomicsBankQuestion[] {
  return [
    ...input.short.map(([commandTerm, question, meaning, misconception, angleTags, level], index) =>
      shortQuestion({
        topicCode: input.topicCode,
        sequence: index + 1,
        levelRelevance: level ?? input.levelRelevance,
        commandTerm,
        question,
        meaning,
        misconceptions: [misconception],
        angleTags: [...angleTags],
      })
    ),
    ...input.ten.map(
      ([commandTerm, question, theoryArea, analysisPath, misconception, angleTags, level], index) =>
        tenMarkQuestion({
          topicCode: input.topicCode,
          sequence: index + 1,
          levelRelevance: level ?? input.levelRelevance,
          commandTerm,
          question,
          theoryAreas: [theoryArea],
          analysisPaths: [analysisPath],
          commonMisconceptions: [misconception],
          angleTags: [...angleTags],
        })
    ),
    ...input.fifteen.map(
      (
        [
          commandTerm,
          question,
          theoryArea,
          analysisPath,
          evaluationDirection,
          misconception,
          angleTags,
          level,
        ],
        index
      ) =>
        fifteenMarkQuestion({
          topicCode: input.topicCode,
          sequence: index + 1,
          levelRelevance: level ?? input.levelRelevance,
          commandTerm,
          question,
          theoryAreas: [theoryArea],
          analysisPaths: [analysisPath],
          evaluationDirections: [evaluationDirection],
          commonMisconceptions: [misconception],
          angleTags: [...angleTags],
        })
    ),
  ];
}
