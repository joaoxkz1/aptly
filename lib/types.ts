import type {
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
} from "./assessment/taxonomy";

export type Subject = "Economics" | "Business" | "Physics";

export const MISTAKE_TYPES = [
  "Lack of evaluation",
  "Weak definitions",
  "Missing diagram explanation",
  "No real-world example",
  "Calculation/setup error",
  "Unclear structure",
] as const;

export type MistakeType = (typeof MISTAKE_TYPES)[number];

export interface Feedback {
  score: number; // out of 7
  band: string; // e.g. "Strong 6"
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
  available: number; // counts toward marksAssessable, NOT unassessed evidence
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
  practiceLevelLow: number; // 1..7
  practiceLevelHigh: number; // 1..7, >= low
  practiceLevelConfidence: Confidence;
  diagramExpected: boolean; // true ONLY when the question genuinely needs a diagram
  diagramSubmitted: boolean; // commit 1: always false (no image)
  diagramAssessmentStatus: DiagramStatus;
  workingsExpected: boolean;
  workingsSubmitted: boolean; // typed workings count even without an image
  workingsAssessmentStatus: WorkingsStatus;
  attachmentContent: AttachmentContent; // commit 1: always "none"
  markBreakdown: AssessmentMarkBreakdownItem[]; // sums to marksAssessable
  limitations: string[]; // honest caveats shown in UI
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
}
