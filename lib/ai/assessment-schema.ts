import "server-only";
import {
  MISTAKE_TYPES,
  type Assessment,
  type AssessmentMarkBreakdownItem,
  type AssessmentSkill,
  type Feedback,
  type MarkBreakdownLabel,
  type MarksSource,
  type MarkDisplayMode,
  type Subject,
} from "@/lib/types";
import {
  ASSESSMENT_FORMATS,
  ASSESSMENT_SKILLS,
  ATTACHMENT_CONTENTS,
  COMMAND_TERMS,
  CONFIDENCES,
  DIAGRAM_STATUSES,
  LEVEL_RELEVANCES,
  MARK_BREAKDOWN_LABELS,
  PAPERS,
  QUESTION_PARTS,
  SYLLABUS_TOPICS,
  SYLLABUS_UNITS,
  WORKINGS_STATUSES,
} from "@/lib/assessment/taxonomy";
import { ASSESSMENT_VERSION } from "@/lib/assessment/config";
import type { ScoringPolicy } from "@/lib/assessment/policy";
import { stripUnassessableDiagramMistake } from "@/lib/assessment/status";
import { bandForScore, validateFeedback } from "./feedback-schema";

/**
 * Strict Structured Outputs schema + instructions + fail-closed validation.
 *
 * Assessment Integrity trust model: the MODEL judges only answer-specific
 * evidence — classification, qualitative feedback, and the marks earned on the
 * assessable portion the SERVER tells it about. It does NOT choose the mark
 * total, the scoring state (marked/provisional/feedback-only), whether a
 * diagram cap applies, or core-analytics eligibility. Those are decided by
 * `resolveScoringPolicy` and stamped here by `assembleAssessment`.
 */

const strArr = () => ({ type: "array", items: { type: "string" } });
const enumStr = (values: readonly string[]) => ({ type: "string", enum: [...values] });

const SCHEMA_PROPERTIES: Record<string, unknown> = {
  // Feedback subset (back-compat).
  score: { type: "integer", description: "Estimated IB-style 0–7 mark (internal signal, not shown)." },
  strengths: strArr(),
  improvements: strArr(),
  mistakes: { type: "array", items: { type: "string", enum: [...MISTAKE_TYPES] } },
  examinerComment: { type: "string" },
  studyNext: { type: "string" },
  // Classification.
  assessmentFormat: enumStr(ASSESSMENT_FORMATS),
  paper: enumStr(PAPERS),
  questionPart: enumStr(QUESTION_PARTS),
  levelRelevance: enumStr(LEVEL_RELEVANCES),
  assessmentSkills: { type: "array", items: { type: "string", enum: [...ASSESSMENT_SKILLS] } },
  commandTerm: enumStr(COMMAND_TERMS),
  commandTermLabel: { type: "string" },
  syllabusUnit: enumStr(SYLLABUS_UNITS),
  syllabusTopic: enumStr(SYLLABUS_TOPICS),
  topicLabel: { type: "string" },
  classificationConfidence: enumStr(CONFIDENCES),
  markingConfidence: enumStr(CONFIDENCES),
  // Practice band (kept internal; not shown as a numeric band per Assessment Integrity).
  practiceLevelLow: { type: "integer" },
  practiceLevelHigh: { type: "integer" },
  practiceLevelConfidence: enumStr(CONFIDENCES),
  // Evidence (drive coverage; NEVER a diagram cap).
  diagramExpected: { type: "boolean" },
  diagramSubmitted: { type: "boolean" },
  diagramAssessmentStatus: enumStr(DIAGRAM_STATUSES),
  workingsExpected: { type: "boolean" },
  workingsSubmitted: { type: "boolean" },
  workingsAssessmentStatus: enumStr(WORKINGS_STATUSES),
  attachmentContent: enumStr(ATTACHMENT_CONTENTS),
  // Marks earned on the ASSESSABLE portion the server specified (null = feedback-only).
  assessableEarned: { type: ["integer", "null"] },
  // Breakdown of the assessable marks only (empty for feedback-only).
  markBreakdown: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: ["label", "awarded", "available", "reason"],
      properties: {
        label: { type: "string", enum: [...MARK_BREAKDOWN_LABELS] },
        awarded: { type: "integer" },
        available: { type: "integer" },
        reason: { type: "string" },
      },
    },
  },
  limitations: strArr(),
};

export const GRADE_RESULT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: Object.keys(SCHEMA_PROPERTIES),
  properties: SCHEMA_PROPERTIES,
};

// Concise, framework-specific best-fit focus (original policy summaries —
// never verbatim official markscheme text). Only best-fit frameworks listed.
const BEST_FIT_FOCUS: Partial<Record<ScoringPolicy["framework"], string>> = {
  paper1a_10_mark:
    "Paper 1(a) focus: answering the exact question asked, accurate relevant terminology, depth and accuracy of explanation, coherent analysis; credit diagrams only where they genuinely support the explanation — there is NO fixed diagram allocation and NO evaluation demanded.",
  paper1b_15_mark:
    "Paper 1(b) focus: relevant theory, application to genuine real-world examples/policies/events, analysis, critical thinking, balanced synthesis and evaluation, and a supported judgement. Diagrams may support the answer where relevant but are NEVER universally compulsory for a high mark.",
  paper2g_15_mark:
    "Paper 2(g) focus: relevant theory, coherent analysis, appropriate use of the SUPPLIED source, balanced evaluation and a supported judgement. Award data-use credit ONLY when source information is applied to build economic arguments — never for merely restating the stimulus. Do NOT require a diagram for the highest level automatically.",
  paper3b_10_mark:
    "Paper 3(b) focus (five strands): appropriateness of the recommended policy; explanation of how it addresses the stated problem; relevant and accurate theory; effective use of the supplied text/data; balanced evaluation with a supported final judgement (alternatives, conditions, trade-offs, time lags, effectiveness where appropriate).",
};

/** A compact, deterministic description of the server-decided marking frame. */
function policyBrief(policy: ScoringPolicy): string {
  if (policy.scoringState === "feedback_only") {
    return [
      "MARKING FRAME (decided by Aptly, not you): FEEDBACK ONLY.",
      "No reliable mark total exists. Set assessableEarned = null and markBreakdown = [].",
      "Give honest qualitative feedback only. Do NOT invent a mark total or a fraction.",
    ].join(" ");
  }

  const parts: string[] = [
    `MARKING FRAME (decided by Aptly, not you): framework = ${policy.framework}; total ${policy.total} marks; ASSESSABLE ${policy.assessable} marks.`,
  ];

  if (policy.recognizedTemplate != null) {
    // Recognised Paper 2(c)–(f)-STYLE 4-mark diagram-explain structure — the
    // ONLY place a 2 written + 2 diagram component split exists.
    parts.push(
      `Recognised 4-mark diagram-explain structure (2 written + 2 diagram). Mark ONLY the written explanation out of ${policy.assessable}. The ${policy.cappedDiagramMarks} diagram mark(s) are EXCLUDED because no diagram was submitted. A theoretically correct causal explanation earns the written marks even without a word-perfect textbook definition — suggest a precise definition only as an optional refinement, never as the main reason marks were lost when the causal chain is correct. NEVER call a valid written response unmarkable for lacking a diagram.`
    );
  } else if (policy.markingMethod === "best_fit") {
    parts.push(
      `Use an IB BEST-FIT judgement. Judge the answer holistically against the markbands and set assessableEarned (0..${policy.assessable}) to the single best-fit mark. Do NOT compute the mark by adding up category points.`
    );
    const focus = BEST_FIT_FOCUS[policy.framework];
    if (focus) parts.push(focus);
  } else if (policy.markingMethod === "analytic") {
    parts.push(
      `Use a question-specific analytic mini-markscheme for the EXACT task asked (there is NO universal point allocation for this mark total). Award assessableEarned (0..${policy.assessable}) for demonstrated economic meaning: accept an accurate definition/answer even when the wording differs from a canonical textbook one; do NOT require an explanation the question does not ask for; credit valid method, own-figure logic carried forward from an earlier error, units and rounding ONLY where the exact question tests them. NEVER apply a generic written+diagram 2+2 split here.`
    );
  } else {
    parts.push(
      `Judge the answer holistically and set assessableEarned (0..${policy.assessable}) as a best-fit practice estimate. The paper format is NOT confirmed — do not assume a specific IB paper's markscheme.`
    );
  }

  parts.push(
    "markBreakdown is a per-criterion DIAGNOSTIC ONLY (Aptly's internal signal, shown to the student qualitatively — NOT the official IB allocation). It does NOT need to sum to assessableEarned. For each criterion the question genuinely tests, set awarded/available to reflect how well it was demonstrated."
  );

  if (policy.scoringState === "provisional") {
    parts.push("This total is INFERRED, not confirmed — Aptly labels the result provisional.");
  }
  return parts.join(" ");
}

export function buildAssessmentInstructions(): string {
  return [
    "You are Aptly, an IB Economics assistant that returns ESTIMATED study feedback for practice — never an official IB grade.",
    "From the question and the student's typed answer, classify the likely IB assessment: format, paper, part, command term (normalized), the skills it tests, the syllabus topic code, and SL/HL relevance.",
    "You do NOT decide the mark total, whether the attempt is marked/provisional/feedback-only, the marking framework, or any diagram-cap policy — Aptly has already decided the MARKING FRAME and you must mark within it.",
    "Mark ONLY the assessable marks stated in the MARKING FRAME. Never invent, expand, or reduce the total. Never award marks for a diagram you cannot see; typed workings in the answer ARE assessable.",
    "The overall mark is a best-fit / analytic judgement, NOT the sum of category points. The markBreakdown is a per-criterion diagnostic only and need not sum to the mark.",
    "Set diagramExpected = true ONLY when the question explicitly instructs the student to draw, use, provide, label, or analyse a diagram. Do NOT set it true merely because a diagram would strengthen the answer. diagramExpected NEVER changes the mark total — the frame already accounts for any cap.",
    "Do NOT add limitations about a missing image, photo, upload, or drawn diagram unless the MARKING FRAME's framework expects a diagram or diagramExpected is true.",
    "For a data-response framework (Paper 2(g)/3(b)), assess data use ONLY against the SOURCE MATERIAL block when present. Never claim to assess charts, tables, figures, or images that were not pasted as readable text.",
    "Never award data-use credit for merely restating the stimulus; data use counts only when source information is applied to economic reasoning.",
    "In a recognised diagram-explain frame, a theoretically correct causal explanation earns the written marks even without a verbatim textbook definition — a precise definition is an optional refinement, not the main loss.",
    "Respect the FACT hasImageAttachment: when false, no image exists — diagramSubmitted must be false, attachmentContent must be none, diagramAssessmentStatus must not be submitted_and_assessed, and workingsAssessmentStatus must not be image_and_assessed.",
    "Choose mistakes only from the fixed list. Keep strengths/improvements to at most 3 each. Use the full plausible mark range; do not cluster mid-band.",
    "Return only the structured JSON defined by the response format.",
  ].join(" ");
}

export function buildAssessmentUserInput(
  subject: Subject,
  topic: string,
  question: string,
  answer: string,
  rubric: string,
  hasImageAttachment: boolean,
  policy: ScoringPolicy,
  sourceMaterial: string | null
): string {
  const hasSource = typeof sourceMaterial === "string" && sourceMaterial.trim() !== "";
  // Multi-part paste with a confirmed part: the model marks the SELECTED part
  // only (server-derived slice), never the other parts of the paste.
  const selectedPart = policy.selectedQuestionPart?.trim();
  const questionBlock =
    selectedPart != null && selectedPart !== "" && selectedPart !== question.trim()
      ? [
          "QUESTION (the selected part being marked — the paste contained multiple parts; mark ONLY this part):",
          selectedPart,
        ]
      : ["QUESTION:", question];
  return [
    rubric,
    "",
    policyBrief(policy),
    "",
    `SUBJECT: ${subject}`,
    `STUDENT-SELECTED TOPIC HINT: ${topic}`,
    "",
    ...questionBlock,
    "",
    ...(hasSource
      ? [
          "SOURCE MATERIAL (pasted by the student — assess data use ONLY against this readable text):",
          sourceMaterial!.trim(),
          "",
        ]
      : []),
    "STUDENT ANSWER (typed; any workings written here are assessable):",
    answer,
    "",
    `FACT — hasImageAttachment: ${hasImageAttachment}`,
    `FACT — hasSourceMaterial: ${hasSource}`,
    "Produce the structured grade-result JSON.",
  ].join("\n");
}

// --- validation helpers ----------------------------------------------------

function fail(msg: string): never {
  throw new Error(`invalid grade result: ${msg}`);
}

function enumOf<T extends string>(value: unknown, allowed: readonly T[], name: string): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  return fail(name);
}

function nonEmptyString(value: unknown, name: string): string {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  return fail(name);
}

function intInRange(value: unknown, lo: number, hi: number, name: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= lo && value <= hi) return value;
  return fail(name);
}

function bool(value: unknown, name: string): boolean {
  if (typeof value === "boolean") return value;
  return fail(name);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

function parseBreakdown(value: unknown): AssessmentMarkBreakdownItem[] {
  if (!Array.isArray(value)) return fail("markBreakdown");
  const labels = new Set<string>(MARK_BREAKDOWN_LABELS);
  return value.map((raw) => {
    if (typeof raw !== "object" || raw === null) return fail("markBreakdown item");
    const o = raw as Record<string, unknown>;
    if (typeof o.label !== "string" || !labels.has(o.label)) return fail("markBreakdown label");
    const available = intInRange(o.available, 1, 60, "markBreakdown.available");
    const awarded = intInRange(o.awarded, 0, available, "markBreakdown.awarded");
    const reason = nonEmptyString(o.reason, "markBreakdown.reason");
    return { label: o.label as MarkBreakdownLabel, awarded, available, reason };
  });
}

/**
 * Whether diagram/image evidence messaging is appropriate for this attempt.
 * Only true for the recognised diagram-explain structure (framework OR a
 * user-confirmed part matching the template) or when the question explicitly
 * expects a diagram — so ordinary essays never show missing-diagram wording.
 */
function diagramMessagingApplies(policy: ScoringPolicy, diagramExpected: boolean): boolean {
  return (
    policy.framework === "paper2_four_mark_diagram_explain" ||
    policy.recognizedTemplate != null ||
    diagramExpected
  );
}

/** Drop model limitations that mention images/diagrams when none is expected. */
function filterLimitations(limitations: string[], showDiagram: boolean): string[] {
  if (showDiagram) return limitations;
  const diagramMention = /\b(image|images|diagram|diagrams|photo|photograph|upload|attachment|drawn|drawing)\b/i;
  return limitations.filter((l) => !diagramMention.test(l));
}

/** The answer-specific evidence the model legitimately produces. */
interface ModelAssessment {
  assessmentFormat: Assessment["assessmentFormat"];
  paper: Assessment["paper"];
  questionPart: Assessment["questionPart"];
  levelRelevance: Assessment["levelRelevance"];
  assessmentSkills: AssessmentSkill[];
  commandTerm: Assessment["commandTerm"];
  commandTermLabel: string;
  syllabusUnit: Assessment["syllabusUnit"];
  syllabusTopic: Assessment["syllabusTopic"];
  topicLabel: string;
  classificationConfidence: Assessment["classificationConfidence"];
  markingConfidence: Assessment["markingConfidence"];
  practiceLevelLow: number;
  practiceLevelHigh: number;
  practiceLevelConfidence: Assessment["practiceLevelConfidence"];
  diagramExpected: boolean;
  diagramSubmitted: boolean;
  diagramAssessmentStatus: Assessment["diagramAssessmentStatus"];
  workingsExpected: boolean;
  workingsSubmitted: boolean;
  workingsAssessmentStatus: Assessment["workingsAssessmentStatus"];
  attachmentContent: Assessment["attachmentContent"];
  assessableEarned: number | null;
  markBreakdown: AssessmentMarkBreakdownItem[];
  limitations: string[];
}

/**
 * Fail-closed validation of the model output against the server MARKING FRAME.
 * Returns { feedback, model } or throws. `assessable` is null for feedback-only.
 */
function validateModelOutput(
  raw: unknown,
  opts: { hasImageAttachment: boolean; assessable: number | null }
): { feedback: Feedback; model: ModelAssessment } {
  if (typeof raw !== "object" || raw === null) return fail("not an object");
  const o = raw as Record<string, unknown>;

  const feedback = validateFeedback(o);

  const assessmentFormat = enumOf(o.assessmentFormat, ASSESSMENT_FORMATS, "assessmentFormat");
  const paper = enumOf(o.paper, PAPERS, "paper");
  const questionPart = enumOf(o.questionPart, QUESTION_PARTS, "questionPart");
  const levelRelevance = enumOf(o.levelRelevance, LEVEL_RELEVANCES, "levelRelevance");
  const commandTerm = enumOf(o.commandTerm, COMMAND_TERMS, "commandTerm");
  const syllabusUnit = enumOf(o.syllabusUnit, SYLLABUS_UNITS, "syllabusUnit");
  const syllabusTopic = enumOf(o.syllabusTopic, SYLLABUS_TOPICS, "syllabusTopic");
  const classificationConfidence = enumOf(o.classificationConfidence, CONFIDENCES, "classificationConfidence");
  const markingConfidence = enumOf(o.markingConfidence, CONFIDENCES, "markingConfidence");
  const diagramAssessmentStatus = enumOf(o.diagramAssessmentStatus, DIAGRAM_STATUSES, "diagramAssessmentStatus");
  const workingsAssessmentStatus = enumOf(o.workingsAssessmentStatus, WORKINGS_STATUSES, "workingsAssessmentStatus");
  const attachmentContent = enumOf(o.attachmentContent, ATTACHMENT_CONTENTS, "attachmentContent");

  const allowedSkills = new Set<string>(ASSESSMENT_SKILLS);
  const assessmentSkills = Array.isArray(o.assessmentSkills)
    ? [...new Set(o.assessmentSkills.filter((s): s is AssessmentSkill => typeof s === "string" && allowedSkills.has(s)))]
    : [];
  if (assessmentSkills.length === 0) fail("assessmentSkills");

  const commandTermLabel = nonEmptyString(o.commandTermLabel, "commandTermLabel");
  const topicLabel = nonEmptyString(o.topicLabel, "topicLabel");

  const practiceLevelLow = intInRange(o.practiceLevelLow, 1, 7, "practiceLevelLow");
  const practiceLevelHigh = intInRange(o.practiceLevelHigh, 1, 7, "practiceLevelHigh");
  if (practiceLevelHigh < practiceLevelLow) fail("practiceLevel range");

  const diagramExpected = bool(o.diagramExpected, "diagramExpected");
  const diagramSubmitted = bool(o.diagramSubmitted, "diagramSubmitted");
  const workingsExpected = bool(o.workingsExpected, "workingsExpected");
  const workingsSubmitted = bool(o.workingsSubmitted, "workingsSubmitted");

  // Image impossibility — reject output that cannot exist without an image.
  if (!opts.hasImageAttachment) {
    if (diagramSubmitted) fail("diagramSubmitted without image");
    if (diagramAssessmentStatus === "submitted_and_assessed") fail("diagram assessed without image");
    if (attachmentContent !== "none") fail("attachmentContent without image");
    if (workingsAssessmentStatus === "image_and_assessed") fail("image workings without image");
  }

  const limitations = stringArray(o.limitations);

  // Marks: enforced against the server frame.
  let assessableEarned: number | null;
  let markBreakdown: AssessmentMarkBreakdownItem[];

  if (opts.assessable == null) {
    // Feedback-only: ignore any model-proposed marks (no denominator exists).
    assessableEarned = null;
    markBreakdown = [];
  } else {
    // The overall mark is a best-fit / analytic judgement (server-authoritative
    // denominator). The breakdown is a per-criterion DIAGNOSTIC only — it is NOT
    // required to sum to the mark, so it is never presented as the official IB
    // allocation. Each row is still validated for internal consistency.
    assessableEarned = intInRange(o.assessableEarned, 0, opts.assessable, "assessableEarned");
    markBreakdown = parseBreakdown(o.markBreakdown);
    if (markBreakdown.length === 0) fail("markBreakdown required when marking");
  }

  feedback.band = bandForScore(feedback.score);

  return {
    feedback,
    model: {
      assessmentFormat,
      paper,
      questionPart,
      levelRelevance,
      assessmentSkills,
      commandTerm,
      commandTermLabel,
      syllabusUnit,
      syllabusTopic,
      topicLabel,
      classificationConfidence,
      markingConfidence,
      practiceLevelLow,
      practiceLevelHigh,
      practiceLevelConfidence: enumOf(o.practiceLevelConfidence, CONFIDENCES, "practiceLevelConfidence"),
      diagramExpected,
      diagramSubmitted,
      diagramAssessmentStatus,
      workingsExpected,
      workingsSubmitted,
      workingsAssessmentStatus,
      attachmentContent,
      assessableEarned,
      markBreakdown,
      limitations,
    },
  };
}

const MARKS_SOURCE_FOR: Record<ScoringPolicy["markTotalSource"], MarksSource> = {
  explicit: "explicit_in_question",
  user_confirmed: "custom_explicit",
  template_inferred: "canonical_inferred",
  unknown: "not_reliably_known",
};

function markDisplayModeFor(policy: ScoringPolicy): MarkDisplayMode {
  if (policy.scoringState === "feedback_only") return "practice_feedback_only";
  if (policy.scoringState === "provisional") return "provisional_estimate";
  return policy.cappedDiagramMarks > 0 ? "partial_estimate" : "exact_estimate";
}

/** Stamp the server-authoritative policy onto the model's evidence. */
function assembleAssessment(model: ModelAssessment, policy: ScoringPolicy): Assessment {
  const feedbackOnly = policy.scoringState === "feedback_only";
  const total = policy.total;
  const assessable = policy.assessable;
  const earned = feedbackOnly ? null : model.assessableEarned;
  const unassessedMarks =
    total != null && assessable != null ? total - assessable : null;
  const showDiagram = diagramMessagingApplies(policy, model.diagramExpected);

  return {
    version: ASSESSMENT_VERSION,
    assessmentFormat: model.assessmentFormat,
    paper: model.paper,
    questionPart: model.questionPart,
    levelRelevance: model.levelRelevance,
    assessmentSkills: model.assessmentSkills,
    commandTerm: model.commandTerm,
    commandTermLabel: model.commandTermLabel,
    syllabusUnit: model.syllabusUnit,
    syllabusTopic: model.syllabusTopic,
    topicLabel: model.topicLabel,
    classificationConfidence: model.classificationConfidence,
    markingConfidence: model.markingConfidence,
    marksAvailable: total,
    marksAssessable: feedbackOnly ? null : assessable,
    marksEarned: earned,
    unassessedMarks,
    marksSource: MARKS_SOURCE_FOR[policy.markTotalSource],
    markDisplayMode: markDisplayModeFor(policy),
    evidenceSplitSource: "not_specified",
    unassessedEvidence: null,
    practiceLevelLow: model.practiceLevelLow,
    practiceLevelHigh: model.practiceLevelHigh,
    practiceLevelConfidence: model.practiceLevelConfidence,
    diagramExpected: model.diagramExpected,
    diagramSubmitted: model.diagramSubmitted,
    diagramAssessmentStatus: model.diagramAssessmentStatus,
    workingsExpected: model.workingsExpected,
    workingsSubmitted: model.workingsSubmitted,
    workingsAssessmentStatus: model.workingsAssessmentStatus,
    attachmentContent: model.attachmentContent,
    markBreakdown: feedbackOnly ? [] : model.markBreakdown,
    limitations: filterLimitations(model.limitations, showDiagram),
    // Assessment Integrity — server-derived, authoritative:
    scoringState: policy.scoringState,
    markTotalSource: policy.markTotalSource,
    recognizedTemplate: policy.recognizedTemplate,
    diagramAssessable: false, // text-only release: a submitted+assessed diagram never happens
    writtenMarksAwarded: earned,
    diagramMarksUnavailable: policy.cappedDiagramMarks > 0 ? policy.cappedDiagramMarks : null,
    capReason: policy.capReason,
    eligibleForCoreAnalytics: policy.scoringState === "marked",
    // IB Marking Fidelity — server-derived framework:
    framework: policy.framework,
    // Data-Dependent Framework — safe source-context indicator (Paper 2(g)/3(b)).
    sourceMaterialProvided: policy.sourceMaterialProvided ?? undefined,
  };
}

/**
 * Public entry: validate the model output against the frame and assemble the
 * final, server-stamped Assessment. Throws (fail closed) on invalid output.
 */
export function validateGradeResult(
  raw: unknown,
  opts: { hasImageAttachment: boolean; policy: ScoringPolicy }
): { feedback: Feedback; assessment: Assessment } {
  const { feedback, model } = validateModelOutput(raw, {
    hasImageAttachment: opts.hasImageAttachment,
    assessable: opts.policy.assessable,
  });
  // A diagram Aptly cannot yet inspect is NOT a diagnosed student weakness:
  // never surface "Missing diagram explanation" as a recurring mistake when the
  // diagram was merely unsubmitted (text-only release).
  feedback.mistakes = stripUnassessableDiagramMistake(
    feedback.mistakes,
    model.diagramExpected,
    model.diagramSubmitted
  );
  return { feedback, assessment: assembleAssessment(model, opts.policy) };
}
