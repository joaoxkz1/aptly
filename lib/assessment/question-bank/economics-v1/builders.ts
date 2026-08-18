import "server-only";
import {
  ECONOMICS_GRADING_BLUEPRINT_VERSION,
  ECONOMICS_QUESTION_BANK_VERSION,
  WRITTEN_ONLY_DIAGRAM_POLICY,
  type EconomicsBankQuestion,
} from "./types";
import type { CommandTerm, LevelRelevance, SyllabusTopic } from "@/lib/types";

type TopicCode = Exclude<SyllabusTopic, "unknown">;
type BankLevel = Exclude<LevelRelevance, "unknown">;

function unitFor(topicCode: TopicCode): EconomicsBankQuestion["unit"] {
  if (topicCode.startsWith("1.")) return "unit_1";
  if (topicCode.startsWith("2.")) return "unit_2";
  if (topicCode.startsWith("3.")) return "unit_3";
  return "unit_4";
}
function idFor(topicCode: TopicCode, marks: 2 | 10 | 15, sequence: number): string {
  return `econ-v1-${topicCode}-${marks}-${String(sequence).padStart(3, "0")}`;
}

interface ShortInput {
  topicCode: TopicCode;
  sequence: number;
  levelRelevance: BankLevel;
  commandTerm: Extract<CommandTerm, "define" | "describe" | "distinguish">;
  question: string;
  meaning: string;
  alternatives?: string[];
  distinctions?: string[];
  misconceptions: string[];
  angleTags: string[];
}

export function shortQuestion(input: ShortInput): EconomicsBankQuestion {
  return {
    id: idFor(input.topicCode, 2, input.sequence),
    bankVersion: ECONOMICS_QUESTION_BANK_VERSION,
    question: input.question,
    marks: 2,
    taxonomyVersion: "economics-2022-v1",
    topicCode: input.topicCode,
    unit: unitFor(input.topicCode),
    levelRelevance: input.levelRelevance,
    framework: "paper2_short_analytic",
    paper: "paper_2",
    questionPart: "a",
    commandTerm: input.commandTerm,
    targetSkills: ["definition"],
    angleTags: input.angleTags,
    diagramPolicy: WRITTEN_ONLY_DIAGRAM_POLICY,
    gradingBlueprintVersion: ECONOMICS_GRADING_BLUEPRINT_VERSION,
    qualityStatus: "curated",
    gradingBlueprint: {
      kind: "short",
      coreEconomicMeaning: input.meaning,
      acceptableAlternativeWording:
        input.alternatives ?? ["Credit an economically equivalent expression of the same meaning."],
      distinctionsRequired:
        input.distinctions ?? ["No further distinction is required beyond the stated concept."],
      commonIncorrectInterpretations: input.misconceptions,
      diagramPolicy: WRITTEN_ONLY_DIAGRAM_POLICY,
      notes: [
        "Award credit for precise economic meaning rather than a memorized sentence.",
        "This guidance is non-exhaustive and is not an additive checklist.",
      ],
    },
  };
}

interface ExtendedInput {
  topicCode: TopicCode;
  sequence: number;
  levelRelevance: BankLevel;
  commandTerm: Extract<
    CommandTerm,
    "explain" | "analyse" | "discuss" | "evaluate" | "examine" | "to_what_extent"
  >;
  question: string;
  theoryAreas: string[];
  analysisPaths: string[];
  applicationExpectations?: string[];
  evaluationDirections?: string[];
  validAlternativeApproaches?: string[];
  commonMisconceptions: string[];
  angleTags: string[];
}

function extendedQuestion(
  marks: 10 | 15,
  input: ExtendedInput
): EconomicsBankQuestion {
  const isEvaluation = marks === 15;
  return {
    id: idFor(input.topicCode, marks, input.sequence),
    bankVersion: ECONOMICS_QUESTION_BANK_VERSION,
    question: input.question,
    marks,
    taxonomyVersion: "economics-2022-v1",
    topicCode: input.topicCode,
    unit: unitFor(input.topicCode),
    levelRelevance: input.levelRelevance,
    framework: isEvaluation ? "paper1b_15_mark" : "paper1a_10_mark",
    paper: "paper_1",
    questionPart: isEvaluation ? "b" : "a",
    commandTerm: input.commandTerm,
    targetSkills: isEvaluation
      ? ["economic_analysis", "application", "evaluation"]
      : ["economic_analysis"],
    angleTags: input.angleTags,
    diagramPolicy: WRITTEN_ONLY_DIAGRAM_POLICY,
    gradingBlueprintVersion: ECONOMICS_GRADING_BLUEPRINT_VERSION,
    qualityStatus: "curated",
    gradingBlueprint: {
      kind: "extended",
      theoryAreas: input.theoryAreas,
      analysisPaths: input.analysisPaths,
      applicationExpectations:
        input.applicationExpectations ??
        (isEvaluation
          ? ["Use relevant real-world examples and integrate them into the economic reasoning."]
          : ["Specific examples are optional; reward relevant illustration where it aids explanation."]),
      evaluationDirections:
        input.evaluationDirections ??
        (isEvaluation
          ? ["Reach a supported, conditional judgement that directly answers the question."]
          : ["Evaluation is not required; reward accurate, developed causal analysis."]),
      validAlternativeApproaches:
        input.validAlternativeApproaches ?? [
          "Credit any other economically valid route that directly addresses the question.",
        ],
      commonMisconceptions: input.commonMisconceptions,
      diagramPolicy: WRITTEN_ONLY_DIAGRAM_POLICY,
      notes: [
        "Treat these directions as non-exhaustive, not as additive submarks.",
        "Do not penalize a valid alternative economic approach merely because it is not listed.",
      ],
    },
  };
}

export function tenMarkQuestion(input: ExtendedInput): EconomicsBankQuestion {
  return extendedQuestion(10, input);
}

export function fifteenMarkQuestion(input: ExtendedInput): EconomicsBankQuestion {
  return extendedQuestion(15, input);
}
