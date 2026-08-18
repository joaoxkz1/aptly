import "server-only";
import { detectMarkTotals } from "@/lib/assessment/preflight";
import { matchTemplate } from "@/lib/assessment/templates";
import { ASSESSMENT_SKILLS, CURRENT_SYLLABUS_TOPIC_LABELS } from "@/lib/assessment/taxonomy";
import type { AssessmentSkill, CommandTerm, LevelRelevance } from "@/lib/types";
import {
  WRITTEN_ONLY_DIAGRAM_POLICY,
  type EconomicsGradingBlueprint,
  type GeneratorMarkTotal,
} from "@/lib/assessment/question-bank/economics-v1/types";
import { MAX_QUESTION_CHARS } from "./config";

export interface AdaptivePracticeTarget {
  topicCode: string;
  topicLabel: string;
  markTotal: GeneratorMarkTotal;
  framework: "paper2_short_analytic" | "paper1a_10_mark" | "paper1b_15_mark";
  levelRelevance: Exclude<LevelRelevance, "unknown">;
  targetSkill: AssessmentSkill;
}
const BLUEPRINT_PROPERTIES = {
  coreEconomicMeaning: { type: ["string", "null"] },
  acceptableAlternativeWording: { type: "array", items: { type: "string" } },
  distinctionsRequired: { type: "array", items: { type: "string" } },
  theoryAreas: { type: "array", items: { type: "string" } },
  analysisPaths: { type: "array", items: { type: "string" } },
  applicationExpectations: { type: "array", items: { type: "string" } },
  evaluationDirections: { type: "array", items: { type: "string" } },
  validAlternativeApproaches: { type: "array", items: { type: "string" } },
  commonMisconceptions: { type: "array", items: { type: "string" } },
  notes: { type: "array", items: { type: "string" } },
} as const;

export const PRACTICE_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "question",
    "commandTerm",
    "targetSkills",
    "angleTags",
    "diagramPolicy",
    "gradingBlueprint",
  ],
  properties: {
    question: { type: "string" },
    commandTerm: {
      type: "string",
      enum: [
        "define",
        "describe",
        "distinguish",
        "explain",
        "analyse",
        "discuss",
        "evaluate",
        "examine",
        "to_what_extent",
      ],
    },
    targetSkills: {
      type: "array",
      items: { type: "string", enum: ASSESSMENT_SKILLS },
    },
    angleTags: { type: "array", items: { type: "string" } },
    diagramPolicy: { type: "string", enum: [WRITTEN_ONLY_DIAGRAM_POLICY] },
    gradingBlueprint: {
      type: "object",
      additionalProperties: false,
      required: Object.keys(BLUEPRINT_PROPERTIES),
      properties: BLUEPRINT_PROPERTIES,
    },
  },
};

const FRAMEWORK_BRIEF: Record<AdaptivePracticeTarget["framework"], string> = {
  paper2_short_analytic:
    "A narrow 2-mark definition, meaning, or distinction. Do not demand extended explanation.",
  paper1a_10_mark:
    "A concise Paper 1(a)-style explanation or analysis. Do not demand evaluation or a real-world example.",
  paper1b_15_mark:
    "A focused Paper 1(b)-style extended response with genuine evaluation, relevant real-world application, and a supported judgement.",
};

export function buildPracticeInstructions(): string {
  return [
    "You are Aptly, writing ONE original economics practice question and a private, question-specific grading guide.",
    "Never copy, quote, closely paraphrase, or claim provenance from any published question bank, exam board, past paper, or markscheme.",
    "Never mention the IB, an exam board, a paper number, a year, or an official markscheme in the question.",
    "The question must be fully self-contained and answerable in writing alone. Never require a source, calculation, diagram, graph, chart, table, figure, image, or attachment.",
    "End the question with exactly one mark total in square brackets, such as [10 marks].",
    "The grading blueprint is trusted guidance for this exact question. It must be non-exhaustive, must not allocate submarks, and must explicitly allow valid alternative economic approaches.",
    "For a 2-mark question, fill the short-definition fields and leave extended-only arrays empty. For a 10- or 15-mark question, set coreEconomicMeaning to null, leave short-only arrays empty, and provide concise nonempty extended guidance.",
    "The diagram policy must exactly match the permitted value in the schema.",
    "Return only the structured JSON defined by the response format.",
  ].join(" ");
}

export function buildPracticeUserInput(target: AdaptivePracticeTarget): string {
  const topicName =
    CURRENT_SYLLABUS_TOPIC_LABELS[
      target.topicCode as keyof typeof CURRENT_SYLLABUS_TOPIC_LABELS
    ] ?? target.topicLabel;
  return [
    "TRUSTED PRACTICE FRAME (write inside it exactly):",
    `Current syllabus topic: ${topicName} (${target.topicCode})`,
    `Course relevance: ${target.levelRelevance}`,
    `Target skill: ${target.targetSkill}`,
    `Task style: ${FRAMEWORK_BRIEF[target.framework]}`,
    `Mark total: ${target.markTotal}; end the question with [${target.markTotal} marks].`,
    "Source material: none. Visual requirement: none.",
    "Produce the structured JSON.",
  ].join("\n");
}

function fail(message: string): never {
  throw new Error(`invalid generated practice: ${message}`);
}

const VISUAL_OR_SOURCE_RELIANCE =
  /\b(diagrams?|graphs?|charts?|tables?|figures?|sketch|axes|draw|plot|images?|pictures?|attachments?|shown below|source material|information from the (?:text|extract|source))\b/i;
const OFFICIAL_CLAIM =
  /\b(official|past[\s-]paper|exam board|markscheme|\bIB\b|paper\s*[123]|baccalaureate)\b/i;

const COMMANDS_FOR_MARK: Record<GeneratorMarkTotal, readonly CommandTerm[]> = {
  2: ["define", "describe", "distinguish"],
  10: ["explain", "analyse"],
  15: ["discuss", "evaluate", "examine", "to_what_extent"],
};

function strings(value: unknown, name: string, allowEmpty = false): string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    return fail(name);
  }
  if (!allowEmpty && value.length === 0) return fail(`${name} empty`);
  return value.map((item) => (item as string).trim());
}

export interface GeneratedPractice {
  question: string;
  commandTerm: CommandTerm;
  targetSkills: AssessmentSkill[];
  angleTags: string[];
  gradingBlueprint: EconomicsGradingBlueprint;
}

export function validateGeneratedPractice(
  raw: unknown,
  target: AdaptivePracticeTarget
): GeneratedPractice {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return fail("not an object");
  }
  const value = raw as Record<string, unknown>;
  if (typeof value.question !== "string") return fail("question");
  const question = value.question.trim();
  if (question.length < 20 || question.length > MAX_QUESTION_CHARS) {
    return fail("question length");
  }
  const detected = detectMarkTotals(question);
  if (detected.kind !== "single" || detected.single?.marks !== target.markTotal) {
    return fail("mark total");
  }
  if (VISUAL_OR_SOURCE_RELIANCE.test(question)) return fail("visual or source reliance");
  if (OFFICIAL_CLAIM.test(question)) return fail("official claim");
  if (matchTemplate(question) !== null) return fail("diagram template");
  if (
    typeof value.commandTerm !== "string" ||
    !COMMANDS_FOR_MARK[target.markTotal].includes(value.commandTerm as CommandTerm)
  ) {
    return fail("command term");
  }
  const commandTerm = value.commandTerm as CommandTerm;

  const targetSkills = strings(value.targetSkills, "target skills") as AssessmentSkill[];
  if (
    targetSkills.some(
      (skill) => !(ASSESSMENT_SKILLS as readonly string[]).includes(skill)
    )
  ) {
    return fail("target skill value");
  }
  const angleTags = strings(value.angleTags, "angle tags");
  if (value.diagramPolicy !== WRITTEN_ONLY_DIAGRAM_POLICY) return fail("diagram policy");
  if (typeof value.gradingBlueprint !== "object" || value.gradingBlueprint === null) {
    return fail("blueprint");
  }
  const blueprint = value.gradingBlueprint as Record<string, unknown>;
  const misconceptions = strings(blueprint.commonMisconceptions, "misconceptions");
  const notes = strings(blueprint.notes, "notes");

  let gradingBlueprint: EconomicsGradingBlueprint;
  if (target.markTotal === 2) {
    if (
      typeof blueprint.coreEconomicMeaning !== "string" ||
      blueprint.coreEconomicMeaning.trim() === ""
    ) {
      return fail("core economic meaning");
    }
    if (
      strings(blueprint.theoryAreas, "theory areas", true).length !== 0 ||
      strings(blueprint.analysisPaths, "analysis paths", true).length !== 0 ||
      strings(blueprint.applicationExpectations, "application expectations", true)
        .length !== 0 ||
      strings(blueprint.evaluationDirections, "evaluation directions", true).length !== 0 ||
      strings(blueprint.validAlternativeApproaches, "valid alternatives", true).length !== 0
    ) {
      return fail("extended fields on short question");
    }
    gradingBlueprint = {
      kind: "short",
      coreEconomicMeaning: blueprint.coreEconomicMeaning.trim(),
      acceptableAlternativeWording: strings(
        blueprint.acceptableAlternativeWording,
        "acceptable wording"
      ),
      distinctionsRequired: strings(blueprint.distinctionsRequired, "distinctions"),
      commonIncorrectInterpretations: misconceptions,
      diagramPolicy: WRITTEN_ONLY_DIAGRAM_POLICY,
      notes,
    };
  } else {
    if (blueprint.coreEconomicMeaning !== null) return fail("extended core meaning");
    if (
      strings(blueprint.acceptableAlternativeWording, "short alternatives", true).length !==
        0 ||
      strings(blueprint.distinctionsRequired, "short distinctions", true).length !== 0
    ) {
      return fail("short fields on extended question");
    }
    gradingBlueprint = {
      kind: "extended",
      theoryAreas: strings(blueprint.theoryAreas, "theory areas"),
      analysisPaths: strings(blueprint.analysisPaths, "analysis paths"),
      applicationExpectations: strings(
        blueprint.applicationExpectations,
        "application expectations"
      ),
      evaluationDirections: strings(
        blueprint.evaluationDirections,
        "evaluation directions"
      ),
      validAlternativeApproaches: strings(
        blueprint.validAlternativeApproaches,
        "valid alternatives"
      ),
      commonMisconceptions: misconceptions,
      diagramPolicy: WRITTEN_ONLY_DIAGRAM_POLICY,
      notes,
    };
  }
  return { question, commandTerm, targetSkills, angleTags, gradingBlueprint };
}
