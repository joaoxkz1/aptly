import "server-only";
import {
  MISTAKE_TYPES,
  type Assessment,
  type AssessmentMarkBreakdownItem,
  type AssessmentSkill,
  type Feedback,
  type MarkBreakdownLabel,
  type Subject,
  type UnassessedEvidence,
  type UnassessedEvidenceType,
} from "@/lib/types";
import {
  ASSESSMENT_FORMATS,
  ASSESSMENT_SKILLS,
  ATTACHMENT_CONTENTS,
  COMMAND_TERMS,
  CONFIDENCES,
  DIAGRAM_STATUSES,
  EVIDENCE_SPLIT_SOURCES,
  LEVEL_RELEVANCES,
  MARK_BREAKDOWN_LABELS,
  MARK_DISPLAY_MODES,
  MARKS_SOURCES,
  PAPERS,
  QUESTION_PARTS,
  SYLLABUS_TOPICS,
  SYLLABUS_UNITS,
  UNASSESSED_EVIDENCE_TYPES,
  WORKINGS_STATUSES,
} from "@/lib/assessment/taxonomy";
import { ASSESSMENT_VERSION } from "@/lib/assessment/config";
import { bandForScore, validateFeedback } from "./feedback-schema";

/**
 * Strict Structured Outputs schema + instructions + fail-closed validation for
 * assessment-aware grading. The model decides the substance; the server adds
 * `version`/`band`, recomputes `unassessedMarks`, and REJECTS impossible output
 * (never repairs it) so no malformed attempt is ever returned or saved.
 */

const strArr = () => ({ type: "array", items: { type: "string" } });
const enumStr = (values: readonly string[]) => ({ type: "string", enum: [...values] });

const SCHEMA_PROPERTIES: Record<string, unknown> = {
  // Feedback subset (back-compat).
  score: { type: "integer", description: "Estimated IB-style 0–7 mark." },
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
  // Marks (stored separately).
  marksAvailable: { type: ["integer", "null"] },
  marksEarned: { type: ["integer", "null"] },
  marksAssessable: { type: ["integer", "null"] },
  unassessedMarks: { type: ["integer", "null"] },
  marksSource: enumStr(MARKS_SOURCES),
  markDisplayMode: enumStr(MARK_DISPLAY_MODES),
  evidenceSplitSource: enumStr(EVIDENCE_SPLIT_SOURCES),
  // Non-null only for partial_estimate (strict nullable object).
  unassessedEvidence: {
    type: ["object", "null"],
    additionalProperties: false,
    required: ["type", "marks", "quote"],
    properties: {
      type: { type: "string", enum: [...UNASSESSED_EVIDENCE_TYPES] },
      marks: { type: "integer" },
      quote: { type: "string" },
    },
  },
  // Practice band.
  practiceLevelLow: { type: "integer" },
  practiceLevelHigh: { type: "integer" },
  practiceLevelConfidence: enumStr(CONFIDENCES),
  // Evidence.
  diagramExpected: { type: "boolean" },
  diagramSubmitted: { type: "boolean" },
  diagramAssessmentStatus: enumStr(DIAGRAM_STATUSES),
  workingsExpected: { type: "boolean" },
  workingsSubmitted: { type: "boolean" },
  workingsAssessmentStatus: enumStr(WORKINGS_STATUSES),
  attachmentContent: enumStr(ATTACHMENT_CONTENTS),
  // Breakdown.
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

export function buildAssessmentInstructions(): string {
  return [
    "You are Aptly, an IB Economics assistant that returns ESTIMATED study feedback for practice — never an official IB grade.",
    "From the question and the student's typed answer, classify the likely IB assessment: format, paper, part, command term (normalized), the skills it tests, the syllabus topic code, and SL/HL relevance.",
    "Award an estimated mark out of the real total ONLY when you can do so honestly. Follow the rubric's honesty rules exactly.",
    "Never invent a mark total or a missing-evidence mark split. When the total or split is not reliably known, set markDisplayMode to practice_feedback_only.",
    "exact_estimate requires marksAssessable == marksAvailable and a markBreakdown whose awarded/available sum to marksEarned/marksAssessable.",
    "For practice_feedback_only and not_reliably_known, set marksEarned and marksAssessable to null and leave markBreakdown empty (do not output 0); marksAvailable may still hold the question's stated total when it is explicit.",
    "partial_estimate is allowed ONLY when the PASTED QUESTION explicitly allocates marks to genuinely missing evidence — a diagram you cannot see, or workings the student did not type. Then set evidenceSplitSource = explicit_in_question and set unassessedEvidence = { type, marks, quote }: type is 'diagram' or 'workings'; marks equals the unassessed marks; quote is a short EXACT phrase copied verbatim from the question that BOTH names that evidence (diagram/draw/graph/curve, or working/workings/method/calculation/show your work) AND states its mark allocation (e.g. 'diagram [2 marks]'). You may NOT justify a split with a canonical/template assumption. If there is no such explicit allocation, use practice_feedback_only.",
    "Use unassessedEvidence.type = diagram only when a diagram is genuinely missing (diagramExpected true and no diagram submitted), and = workings only when typed workings are genuinely missing (workingsExpected true and workingsSubmitted false).",
    "Missing source/stimulus material (an unpasted text/figure/data) is NOT partial evidence — it stays practice_feedback_only.",
    "Set unassessedEvidence to null for every mode except partial_estimate.",
    "Set diagramExpected = true ONLY when the question explicitly instructs the student to draw, use, provide, label, or analyse a diagram, or clearly contains a diagram-specific allocated mark component. Do NOT set it true merely because a diagram would strengthen the answer. A clear text-only Paper 1 explanation whose prompt does not require a diagram can receive an exact_estimate.",
    "Respect the FACT hasImageAttachment: when false, no image exists — diagramSubmitted must be false, attachmentContent must be none, and you must not claim an image was assessed. Typed workings in the answer are still assessable.",
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
  hasImageAttachment: boolean
): string {
  return [
    rubric,
    "",
    `SUBJECT: ${subject}`,
    `STUDENT-SELECTED TOPIC HINT: ${topic}`,
    "",
    "QUESTION:",
    question,
    "",
    "STUDENT ANSWER (typed; any workings written here are assessable):",
    answer,
    "",
    `FACT — hasImageAttachment: ${hasImageAttachment}`,
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

function intOrNull(value: unknown, name: string): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isInteger(value)) return value;
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

function sum(items: AssessmentMarkBreakdownItem[], key: "awarded" | "available"): number {
  return items.reduce((s, b) => s + b[key], 0);
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** True if the (whitespace-normalized) quote appears verbatim in the question. */
function quoteInQuestion(quote: string, question: string): boolean {
  const q = normalizeWhitespace(quote);
  if (q === "") return false;
  return normalizeWhitespace(question).includes(q);
}

/** True if the quote explicitly names the claimed evidence type. */
function quoteNamesEvidence(quote: string, type: UnassessedEvidenceType): boolean {
  const q = normalizeWhitespace(quote);
  if (type === "diagram") return /\b(diagram|draw|graph|curve)\b/.test(q);
  return /(\bworkings?\b|\bmethod\b|\bcalculation\b|show your work)/.test(q);
}

/** True if the quote contains the integer mark allocation (e.g. 2, [2], [2 marks], (2 marks)). */
function quoteHasMarks(quote: string, marks: number): boolean {
  const q = normalizeWhitespace(quote);
  return new RegExp(`(?<![0-9])${marks}(?![0-9])`).test(q);
}

function parseUnassessedEvidence(value: unknown): UnassessedEvidence | null {
  if (value === null) return null;
  if (typeof value !== "object") return fail("unassessedEvidence");
  const o = value as Record<string, unknown>;
  const type = enumOf(o.type, UNASSESSED_EVIDENCE_TYPES, "unassessedEvidence.type");
  const marks = intInRange(o.marks, 1, 200, "unassessedEvidence.marks");
  const quote = nonEmptyString(o.quote, "unassessedEvidence.quote");
  return { type, marks, quote };
}

/**
 * Fail-closed validation. Returns { feedback, assessment } or throws.
 * Commit 1 always passes hasImageAttachment = false.
 */
export function validateGradeResult(
  raw: unknown,
  opts: { hasImageAttachment: boolean; question: string }
): { feedback: Feedback; assessment: Assessment } {
  if (typeof raw !== "object" || raw === null) return fail("not an object");
  const o = raw as Record<string, unknown>;

  // Feedback subset (reuses existing validator: score/strengths/improvements/mistakes/comment/studyNext).
  const feedback = validateFeedback(o);

  // Classification enums + labels.
  const assessmentFormat = enumOf(o.assessmentFormat, ASSESSMENT_FORMATS, "assessmentFormat");
  const paper = enumOf(o.paper, PAPERS, "paper");
  const questionPart = enumOf(o.questionPart, QUESTION_PARTS, "questionPart");
  const levelRelevance = enumOf(o.levelRelevance, LEVEL_RELEVANCES, "levelRelevance");
  const commandTerm = enumOf(o.commandTerm, COMMAND_TERMS, "commandTerm");
  const syllabusUnit = enumOf(o.syllabusUnit, SYLLABUS_UNITS, "syllabusUnit");
  const syllabusTopic = enumOf(o.syllabusTopic, SYLLABUS_TOPICS, "syllabusTopic");
  const classificationConfidence = enumOf(o.classificationConfidence, CONFIDENCES, "classificationConfidence");
  const markingConfidence = enumOf(o.markingConfidence, CONFIDENCES, "markingConfidence");
  const marksSource = enumOf(o.marksSource, MARKS_SOURCES, "marksSource");
  const markDisplayMode = enumOf(o.markDisplayMode, MARK_DISPLAY_MODES, "markDisplayMode");
  const evidenceSplitSource = enumOf(o.evidenceSplitSource, EVIDENCE_SPLIT_SOURCES, "evidenceSplitSource");
  const practiceLevelConfidence = enumOf(o.practiceLevelConfidence, CONFIDENCES, "practiceLevelConfidence");
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

  // Image impossibility — reject (do not coerce) output that cannot exist without an image.
  if (!opts.hasImageAttachment) {
    if (diagramSubmitted) fail("diagramSubmitted without image");
    if (diagramAssessmentStatus === "submitted_and_assessed") fail("diagram assessed without image");
    if (attachmentContent !== "none") fail("attachmentContent without image");
    if (workingsAssessmentStatus === "image_and_assessed") fail("image workings without image");
  }

  const limitations = stringArray(o.limitations);
  const breakdown = parseBreakdown(o.markBreakdown);

  // Marks logic — stored separately, evidence-aware, fail-closed.
  let marksAvailable = intOrNull(o.marksAvailable, "marksAvailable");
  let marksAssessable = intOrNull(o.marksAssessable, "marksAssessable");
  let marksEarned = intOrNull(o.marksEarned, "marksEarned");
  let unassessedMarks: number | null;

  const unassessedEvidence = parseUnassessedEvidence(o.unassessedEvidence);

  if (marksSource === "not_reliably_known") {
    if (markDisplayMode !== "practice_feedback_only") fail("unknown source must be practice-only");
    if (marksAvailable !== null || marksAssessable !== null || marksEarned !== null) fail("invented total");
    if (breakdown.length !== 0) fail("breakdown without marks");
    marksAvailable = marksAssessable = marksEarned = unassessedMarks = null;
  } else if (markDisplayMode === "practice_feedback_only") {
    // Known total but ambiguous evidence/split -> no numeric estimate.
    // Strict on the dangerous case (a real earned-mark claim); the inert
    // marksAssessable is normalized to null (no fraction is ever shown here).
    if (marksEarned !== null) fail("practice mode must not estimate an earned mark");
    if (breakdown.length !== 0) fail("breakdown in practice mode");
    marksAssessable = null;
    marksEarned = null;
    unassessedMarks = null;
    // marksAvailable may remain the question's stated total (shown as context).
  } else if (markDisplayMode === "exact_estimate") {
    if (marksAvailable === null || marksAssessable === null || marksEarned === null) fail("exact requires marks");
    if (marksAvailable < 1) fail("marksAvailable < 1");
    if (!(marksEarned >= 0 && marksEarned <= marksAssessable && marksAssessable <= marksAvailable))
      fail("exact mark ordering");
    if (marksAssessable !== marksAvailable) fail("exact must be fully assessable");
    if (breakdown.length === 0) fail("exact requires breakdown");
    if (sum(breakdown, "awarded") !== marksEarned) fail("breakdown awarded != marksEarned");
    if (sum(breakdown, "available") !== marksAssessable) fail("breakdown available != marksAssessable");
    unassessedMarks = 0;
  } else {
    // partial_estimate — allowed ONLY with an explicit allocation in the
    // pasted question, proven by a structured, verifiable unassessedEvidence.
    if (marksAvailable === null || marksAssessable === null || marksEarned === null) fail("partial requires marks");
    if (marksAvailable < 1) fail("marksAvailable < 1");
    if (evidenceSplitSource !== "explicit_in_question") fail("partial requires explicit_in_question split");
    if (!(marksEarned >= 0 && marksEarned <= marksAssessable && marksAssessable < marksAvailable))
      fail("partial mark ordering");
    if (breakdown.length === 0) fail("partial requires breakdown");
    if (sum(breakdown, "awarded") !== marksEarned) fail("breakdown awarded != marksEarned");
    if (sum(breakdown, "available") !== marksAssessable) fail("breakdown available != marksAssessable");
    unassessedMarks = marksAvailable - marksAssessable;
    if (!(unassessedMarks > 0)) fail("partial requires unassessed > 0");

    // The split must be backed by genuinely-missing evidence whose marks are
    // explicitly allocated in the question text.
    if (unassessedEvidence === null) fail("partial requires unassessedEvidence");
    if (unassessedEvidence.marks !== unassessedMarks) fail("unassessedEvidence.marks != unassessedMarks");
    if (!quoteInQuestion(unassessedEvidence.quote, opts.question)) fail("evidence quote not found in question");
    if (!quoteNamesEvidence(unassessedEvidence.quote, unassessedEvidence.type)) fail("quote does not name the evidence type");
    if (!quoteHasMarks(unassessedEvidence.quote, unassessedEvidence.marks)) fail("quote missing the numeric allocation");
    if (unassessedEvidence.type === "diagram" && !(diagramExpected && !diagramSubmitted))
      fail("diagram not genuinely missing");
    if (unassessedEvidence.type === "workings" && !(workingsExpected && !workingsSubmitted))
      fail("workings not genuinely missing");
  }

  // unassessedEvidence may only accompany a partial_estimate.
  if (markDisplayMode !== "partial_estimate" && unassessedEvidence !== null) {
    fail("unassessedEvidence must be null unless partial_estimate");
  }

  const assessment: Assessment = {
    version: ASSESSMENT_VERSION,
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
    marksAvailable,
    marksAssessable,
    marksEarned,
    unassessedMarks,
    marksSource,
    markDisplayMode,
    evidenceSplitSource,
    unassessedEvidence: markDisplayMode === "partial_estimate" ? unassessedEvidence : null,
    practiceLevelLow,
    practiceLevelHigh,
    practiceLevelConfidence,
    diagramExpected,
    diagramSubmitted,
    diagramAssessmentStatus,
    workingsExpected,
    workingsSubmitted,
    workingsAssessmentStatus,
    attachmentContent,
    markBreakdown: breakdown,
    limitations,
  };

  // band stays consistent with the 0–7 score for back-compat.
  feedback.band = bandForScore(feedback.score);

  return { feedback, assessment };
}
