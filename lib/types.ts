import type { DiagramEvidence } from "./diagram/evidence";
import type {
  ASSESSMENT_FORMATS,
  ASSESSMENT_FRAMEWORKS,
  ASSESSMENT_SKILLS,
  ATTACHMENT_CONTENTS,
  COMMAND_TERMS,
  CONFIDENCES,
  DIAGRAM_STATUSES,
  ECONOMICS_TAXONOMY_VERSIONS,
  EVIDENCE_SPLIT_SOURCES,
  LEVEL_RELEVANCES,
  MARK_BREAKDOWN_LABELS,
  MARK_DISPLAY_MODES,
  MARK_TOTAL_SOURCES,
  MARKS_SOURCES,
  PAPERS,
  QUESTION_PARTS,
  RUBRIC_TEMPLATE_IDS,
  SCORING_STATES,
  SYLLABUS_TOPICS,
  SYLLABUS_UNITS,
  UNASSESSED_EVIDENCE_TYPES,
  WORKINGS_STATUSES,
} from "./assessment/taxonomy";

export type Subject = "Economics" | "Business" | "Physics";

export const MISTAKE_TYPES = [
  "Lack of evaluation",
  "Underdeveloped evaluation",
  "Weak definitions",
  "Weak terminology",
  "Inaccurate economic theory",
  "Underdeveloped economic analysis",
  "No real-world example",
  "Irrelevant real-world example",
  "Underdeveloped real-world example",
  "Missing required diagram",
  "Incorrect diagram explanation",
  "Insufficient source use",
  "Calculation/setup error",
  "Unsupported judgement",
  "Unclear structure",
  // Historical output retained for legacy reads; econ-v4 never emits it.
  "Missing diagram explanation",
] as const;

export type MistakeType = (typeof MISTAKE_TYPES)[number];

export interface Feedback {
  score: number | null; // deterministic compatibility value; null for feedback-only
  band: string | null; // compatibility label; never an IB subject grade
  strengths: string[];
  improvements: string[];
  mistakes: MistakeType[];
  examinerComment: string;
  studyNext: string;
}

// --- Assessment-aware grading (string-literal types from taxonomy.ts) ------

export type AssessmentFormat = (typeof ASSESSMENT_FORMATS)[number];
export type Paper = (typeof PAPERS)[number];
export type QuestionPart = (typeof QUESTION_PARTS)[number];
export type LevelRelevance = (typeof LEVEL_RELEVANCES)[number];
export type MarksSource = (typeof MARKS_SOURCES)[number];
export type Confidence = (typeof CONFIDENCES)[number];
export type MarkDisplayMode = (typeof MARK_DISPLAY_MODES)[number];
export type EvidenceSplitSource = (typeof EVIDENCE_SPLIT_SOURCES)[number];
export type DiagramStatus = (typeof DIAGRAM_STATUSES)[number];
export type WorkingsStatus = (typeof WORKINGS_STATUSES)[number];
export type SyllabusUnit = (typeof SYLLABUS_UNITS)[number];
export type SyllabusTopic = (typeof SYLLABUS_TOPICS)[number];
export type CommandTerm = (typeof COMMAND_TERMS)[number];
export type AssessmentSkill = (typeof ASSESSMENT_SKILLS)[number];
export type AttachmentContent = (typeof ATTACHMENT_CONTENTS)[number];
export type MarkBreakdownLabel = (typeof MARK_BREAKDOWN_LABELS)[number];
export type UnassessedEvidenceType = (typeof UNASSESSED_EVIDENCE_TYPES)[number];
export type MarkTotalSource = (typeof MARK_TOTAL_SOURCES)[number];
export type ScoringState = (typeof SCORING_STATES)[number];
export type RubricTemplateId = (typeof RUBRIC_TEMPLATE_IDS)[number];
export type AssessmentFramework = (typeof ASSESSMENT_FRAMEWORKS)[number];
export type EconomicsTaxonomyVersion = (typeof ECONOMICS_TAXONOMY_VERSIONS)[number];

export interface GradingProvenance {
  rubricVersion: string;
  taxonomyVersion: EconomicsTaxonomyVersion;
  gradingContractVersion: string;
  modelId: string;
  reasoningEffort: string;
}

// Structured proof that a partial estimate's missing-evidence marks are
// explicitly allocated in the question (server-verified against the text).
export interface UnassessedEvidence {
  type: UnassessedEvidenceType;
  marks: number; // === unassessedMarks; >= 1
  quote: string; // exact phrase from the question naming the evidence + its marks
}

export interface AssessmentMarkBreakdownItem {
  label: MarkBreakdownLabel;
  awarded: number;
  available: number; // econ-v4 diagnostic denominator is always 4; never summed into marks
  reason: string;
}

export interface Assessment {
  version: number; // ASSESSMENT_VERSION
  assessmentFormat: AssessmentFormat; // label only; does NOT imply a diagram is required
  paper: Paper;
  questionPart: QuestionPart;
  levelRelevance: LevelRelevance;
  assessmentSkills: AssessmentSkill[]; // what the question actually tests
  commandTerm: CommandTerm; // normalized, for analytics
  commandTermLabel: string; // free-text display, e.g. "Discuss"
  syllabusUnit: SyllabusUnit;
  syllabusTopic: SyllabusTopic; // controlled code; analytics group by this
  topicLabel: string; // free human label
  classificationConfidence: Confidence;
  markingConfidence: Confidence;
  // Marks stored SEPARATELY. Readiness uses marksEarned / marksAssessable.
  marksAvailable: number | null; // full total of the question (null when not reliably known)
  marksAssessable: number | null; // marks Aptly could actually judge (<= marksAvailable)
  marksEarned: number | null; // <= marksAssessable
  unassessedMarks: number | null; // marksAvailable - marksAssessable
  marksSource: MarksSource;
  markDisplayMode: MarkDisplayMode;
  // partial_estimate REQUIRES evidenceSplitSource === "explicit_in_question".
  evidenceSplitSource: EvidenceSplitSource;
  // Non-null ONLY for partial_estimate: the genuinely-missing evidence whose
  // marks are explicitly allocated in the question (server-verified). Null
  // for exact_estimate and practice_feedback_only.
  unassessedEvidence: UnassessedEvidence | null;
  practiceLevelLow: number | null; // deterministic compatibility range; null for feedback-only
  practiceLevelHigh: number | null;
  practiceLevelConfidence: Confidence | null;
  diagramExpected: boolean; // true ONLY when the question genuinely needs a diagram
  diagramSubmitted: boolean; // commit 1: always false (no image)
  diagramAssessmentStatus: DiagramStatus;
  workingsExpected: boolean;
  workingsSubmitted: boolean; // typed workings count even without an image
  workingsAssessmentStatus: WorkingsStatus;
  attachmentContent: AttachmentContent; // commit 1: always "none"
  // Non-official fixed-/4 diagnostics; never summed to derive marksEarned.
  markBreakdown: AssessmentMarkBreakdownItem[];
  limitations: string[]; // honest caveats shown in UI
  markBand?: string | null;
  markBandLow?: number | null;
  markBandHigh?: number | null;
  bandPosition?: "lower" | "middle" | "upper" | null;
  bandRationale?: string | null;
  /** Server-stamped for v3+; absence always resolves as legacy. */
  gradingProvenance?: GradingProvenance;
  // --- Assessment Integrity: canonical, server-derived policy ---------------
  // Decided by trusted server logic from the preflight result + an explicit or
  // user-confirmed total + a recognised controlled template + validated model
  // evidence. NEVER chosen by the model. Optional so a legacy (v1 / no
  // assessment) row parsed as `Assessment` does not falsely claim them — the
  // status helper treats their absence as "legacy" and renders conservatively.
  scoringState?: ScoringState;
  markTotalSource?: MarkTotalSource;
  recognizedTemplate?: RubricTemplateId | null;
  diagramAssessable?: boolean; // whether a submitted diagram could be assessed
  writtenMarksAwarded?: number | null; // marks earned from the written response
  diagramMarksUnavailable?: number | null; // template diagram marks capped away
  capReason?: string | null; // why capped marks are unavailable (template only)
  eligibleForCoreAnalytics?: boolean; // === (scoringState === "marked")
  // IB Marking Fidelity: the server-derived marking framework. Optional so
  // legacy attempts (which lack it) render conservatively as generic.
  framework?: AssessmentFramework;
  // Beta Trust: how the framework was established — "detected" from the
  // question text, "user_confirmed" in the preflight chooser, or
  // "aptly_practice" (fixed by a generated question). Server-stamped from the
  // policy; optional so legacy attempts (which lack it) keep the neutral
  // detection wording. The feedback header MUST NOT claim autonomous
  // detection when this says the student confirmed the format.
  frameworkSource?: "detected" | "user_confirmed" | "aptly_practice" | null;
  // Data-Dependent Framework: a safe source-context indicator for Paper 2(g) /
  // Paper 3(b). true only when usable source text/data was supplied. Absent on
  // every other framework and on pre-patch attempts (treated conservatively).
  sourceMaterialProvided?: boolean;
}

export interface Attempt {
  id: string;
  createdAt: string; // ISO date
  subject: Subject;
  topic: string;
  question: string;
  answer: string;
  feedback: Feedback;
  assessment?: Assessment | null; // legacy attempts have this undefined/null
  // --- Practice Loop -------------------------------------------------------
  // Durable revision link: the earlier attempt this one revises. Deleting the
  // original NULLs this (never the revision itself). Undefined/null = not a
  // revision.
  parentAttemptId?: string | null;
  // The Aptly-generated practice question this attempt answered (grading reads
  // the stored question/source server-side). Undefined/null = a pasted question.
  practiceQuestionId?: string | null;
  // Manual source retention: the pasted Paper 2(g)/3(b) source this attempt
  // was graded against, stored privately (per-user RLS) so a revision reuses
  // the exact same source automatically. Null/undefined for non-source
  // attempts, pre-patch attempts, and generated practice (whose source lives
  // in practice_questions).
  sourceMaterial?: string | null;
  // --- Diagram Evidence V1 --------------------------------------------------
  // Structured, feedback-only findings from a reviewed diagram photo (see
  // lib/diagram/evidence.ts). Strictly per-attempt: a revision never inherits
  // it. Never read by grading, analytics, readiness, or practice targeting;
  // carries no marks and no image data. Null/undefined = no diagram photo was
  // reviewed for this attempt.
  diagramEvidence?: DiagramEvidence | null;
}

/**
 * An Aptly-generated practice question (Practice Loop). Private to its owner
 * (RLS); the generated source material for Paper 2(g)/3(b) lives ONLY here and
 * grading always retrieves it server-side — never from the client.
 */
export interface PracticeQuestion {
  id: string;
  createdAt: string;
  question: string;
  sourceMaterial: string | null;
  framework: AssessmentFramework;
  markTotal: number;
  topicCode: string;
  topicLabel: string;
  /** Missing on historical rows and resolved as economics-legacy-v3. */
  taxonomyVersion?: EconomicsTaxonomyVersion;
  skill: AssessmentSkill;
  /** Evidence-backed "Why this question?" copy shown to the student. */
  why: string;
}
