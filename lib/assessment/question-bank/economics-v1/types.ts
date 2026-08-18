import "server-only";
import type {
  AssessmentFramework,
  AssessmentSkill,
  CommandTerm,
  LevelRelevance,
  Paper,
  QuestionPart,
  SyllabusTopic,
  SyllabusUnit,
} from "@/lib/types";

export const ECONOMICS_QUESTION_BANK_VERSION = "economics-question-bank-v1" as const;
export const ECONOMICS_GRADING_BLUEPRINT_VERSION = "economics-grading-blueprint-v1" as const;

export type GeneratorMarkTotal = 2 | 10 | 15;
export type QuestionOrigin = "curated_bank" | "adaptive_generated";
export type QuestionQualityStatus = "curated" | "teacher_reviewed" | "generated" | "deprecated";

export const WRITTEN_ONLY_DIAGRAM_POLICY =
  "A diagram may support a written answer but is not required and is not assessed by this question." as const;

export interface ShortGradingBlueprint {
  kind: "short";
  coreEconomicMeaning: string;
  acceptableAlternativeWording: string[];
  distinctionsRequired: string[];
  commonIncorrectInterpretations: string[];
  diagramPolicy: string;
  notes: string[];
}
export interface ExtendedGradingBlueprint {
  kind: "extended";
  theoryAreas: string[];
  analysisPaths: string[];
  applicationExpectations: string[];
  evaluationDirections: string[];
  validAlternativeApproaches: string[];
  commonMisconceptions: string[];
  diagramPolicy: string;
  notes: string[];
}

export type EconomicsGradingBlueprint = ShortGradingBlueprint | ExtendedGradingBlueprint;

export interface EconomicsBankQuestion {
  id: string;
  bankVersion: typeof ECONOMICS_QUESTION_BANK_VERSION;
  question: string;
  marks: GeneratorMarkTotal;
  taxonomyVersion: "economics-2022-v1";
  topicCode: Exclude<SyllabusTopic, "unknown">;
  unit: Exclude<SyllabusUnit, "unknown">;
  levelRelevance: Exclude<LevelRelevance, "unknown">;
  framework: Extract<
    AssessmentFramework,
    "paper2_short_analytic" | "paper1a_10_mark" | "paper1b_15_mark"
  >;
  paper: Extract<Paper, "paper_1" | "paper_2">;
  questionPart: Extract<QuestionPart, "a" | "b">;
  commandTerm: CommandTerm;
  targetSkills: AssessmentSkill[];
  angleTags: string[];
  diagramPolicy: typeof WRITTEN_ONLY_DIAGRAM_POLICY;
  gradingBlueprint: EconomicsGradingBlueprint;
  gradingBlueprintVersion: typeof ECONOMICS_GRADING_BLUEPRINT_VERSION;
  qualityStatus: QuestionQualityStatus;
}
