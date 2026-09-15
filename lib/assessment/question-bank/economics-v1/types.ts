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
export const ECONOMICS_GRADING_BLUEPRINT_VERSION = "economics-grading-blueprint-v2" as const;
export const FOUR_MARK_BLUEPRINT_VERSION = "economics-four-mark-blueprint-v2" as const;
export const ESSAY_BLUEPRINT_VERSION = "economics-essay-blueprint-v3" as const;

export type GeneratorMarkTotal = 2 | 4 | 10 | 15;
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
  diagramRequirement?: {
    role: "necessary_for_task" | "optional_appropriate";
    family: import("@/lib/assessment/diagram-contract").DiagramFamily | null;
    reason: string;
  };
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

export interface FourMarkGradingBlueprint {
  kind: "four_mark";
  format: "diagram_explanation" | "written_explanation";
  diagramPolicy: string;
  diagramCriteria: import("@/lib/assessment/diagram-contract").DiagramTaskCriteria | null;
  /** Two developed explanations (each 0..2), or explicit written 0..4 descriptors. */
  writtenCriteria: string[];
  notes: string[];
  reviewProvenance: {
    author: "Aptly";
    status: "authored_unreviewed" | "source_reviewed";
    basis: string[];
    reviewedAt?: string;
    reviewReference?: string;
    independentlyTeacherValidated?: boolean;
  };
}
export type EconomicsGradingBlueprint = ShortGradingBlueprint | ExtendedGradingBlueprint | FourMarkGradingBlueprint;

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
    "paper2_short_analytic" | "paper1a_10_mark" | "paper1b_15_mark" | "paper2_four_mark_diagram_explain" | "generic_practice"
  >;
  paper: Extract<Paper, "paper_1" | "paper_2" | "custom">;
  questionPart: Extract<QuestionPart, "a" | "b" | "unknown">;
  commandTerm: CommandTerm;
  targetSkills: AssessmentSkill[];
  angleTags: string[];
  diagramPolicy: string;
  sourceMaterial?: string | null;
  gradingBlueprint: EconomicsGradingBlueprint;
  gradingBlueprintVersion: "economics-grading-blueprint-v1" | typeof ECONOMICS_GRADING_BLUEPRINT_VERSION | "economics-four-mark-blueprint-v1" | typeof FOUR_MARK_BLUEPRINT_VERSION;
  qualityStatus: QuestionQualityStatus;
}
