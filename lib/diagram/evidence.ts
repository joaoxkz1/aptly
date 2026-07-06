/**
 * Diagram Evidence V1 — the shared domain module (types, copy, presenter).
 *
 * Pure and client-safe: no secrets, no fetch, no React. Everything both
 * rendering surfaces (the feedback screen and the Learning log) need to show
 * a diagram review lives HERE, single-sourced, so the two surfaces can never
 * contradict each other.
 *
 * Non-negotiable shape: DiagramEvidence carries NO marks, NO percentages, NO
 * numeric confidence scores, and NO image data of any kind. It is study
 * feedback about a transient photo — never a mark input. Grading, analytics,
 * practice targeting, readiness, and revisions must never read it.
 */

// --- Types -------------------------------------------------------------------

/** The exactly-three review states a diagram photo can resolve to. */
export const DIAGRAM_REVIEW_STATUSES = [
  "reviewed_clearly",
  "partially_readable",
  "unable_to_assess",
] as const;

export type DiagramReviewStatus = (typeof DIAGRAM_REVIEW_STATUSES)[number];

/** Economics diagram features the review may comment on — a closed list. */
export const DIAGRAM_ELEMENTS = [
  "axes_labels",
  "curve_labels",
  "equilibrium",
  "shift_arrows",
  "new_equilibrium",
  "welfare_areas",
  "annotations",
] as const;

export type DiagramElement = (typeof DIAGRAM_ELEMENTS)[number];

/**
 * Three-valued observation: "unclear" is NEVER "missing". A feature that
 * cannot be read in the photo is reported as unclear/not visible in the
 * PHOTO — never as absent from the student's work.
 */
export const DIAGRAM_OBSERVATIONS = ["visible", "unclear", "not_visible"] as const;

export type DiagramObservation = (typeof DIAGRAM_OBSERVATIONS)[number];

export const DIAGRAM_RELEVANCES = ["appears_relevant", "appears_unrelated", "unclear"] as const;

export type DiagramRelevance = (typeof DIAGRAM_RELEVANCES)[number];

/** Comparison against the written answer — only made on a clear read. */
export const DIAGRAM_CONSISTENCIES = ["supports", "conflicts", "unclear", "not_checked"] as const;

export type DiagramConsistency = (typeof DIAGRAM_CONSISTENCIES)[number];

export interface DiagramElementFinding {
  element: DiagramElement;
  observed: DiagramObservation;
}

/**
 * The structured findings persisted (as JSONB) on the attempt that submitted
 * the photo. Per-attempt only: a revision never inherits it. The raw image is
 * transient request data and is never referenced from here.
 */
export interface DiagramEvidence {
  version: 1;
  status: DiagramReviewStatus;
  /** Short label like "demand and supply", only when reasonably identifiable. */
  graphTypeObserved: string | null;
  relevanceToQuestion: DiagramRelevance;
  elements: DiagramElementFinding[];
  consistencyWithAnswer: DiagramConsistency;
  /** At most two concrete study suggestions — never mark deductions. */
  improvements: string[];
}

/** Light structural guard for data read back from storage or the API. */
export function isDiagramEvidence(value: unknown): value is DiagramEvidence {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1 &&
    typeof v.status === "string" &&
    (DIAGRAM_REVIEW_STATUSES as readonly string[]).includes(v.status) &&
    (v.graphTypeObserved === null || typeof v.graphTypeObserved === "string") &&
    typeof v.relevanceToQuestion === "string" &&
    (DIAGRAM_RELEVANCES as readonly string[]).includes(v.relevanceToQuestion) &&
    Array.isArray(v.elements) &&
    typeof v.consistencyWithAnswer === "string" &&
    (DIAGRAM_CONSISTENCIES as readonly string[]).includes(v.consistencyWithAnswer) &&
    Array.isArray(v.improvements)
  );
}

// --- Copy (single-sourced; the copy audit pins these to ONE module) ----------

/** Student-facing labels for the three review states. */
export const DIAGRAM_REVIEW_STATUS_LABELS: Record<DiagramReviewStatus, string> = {
  reviewed_clearly: "Reviewed clearly",
  partially_readable: "Partially readable",
  unable_to_assess: "Unable to assess reliably",
};

/**
 * The ONE fixed limitation statement every Diagram Evidence card shows.
 * Honest and non-negotiable: approximate, not IB marking, no mark effect.
 */
export const DIAGRAM_EVIDENCE_LIMITATION =
  "Aptly reviewed your diagram photo to give study feedback. Visual review is approximate — it is not IB marking and does not change your mark estimate.";

/**
 * Conditional privacy + limitation disclosure for the attachment control.
 * Accurate about timing: unlike Scan, the diagram photo is uploaded only when
 * the answer is graded — attaching alone sends nothing anywhere.
 */
export const DIAGRAM_PRIVACY_DISCLOSURE =
  "Diagram photos are sent to OpenAI for review when you grade this answer. Aptly does not store the image. Diagram review gives study feedback only — it never changes your mark estimate.";

/** The disclosure to render, or null when no diagram is attached. */
export function diagramPrivacyDisclosure(hasAttachment: boolean): string | null {
  return hasAttachment ? DIAGRAM_PRIVACY_DISCLOSURE : null;
}

/**
 * Retake guidance shown INSTEAD of findings when the review is
 * "unable_to_assess" — deterministic copy, never model-generated, so an
 * unreadable photo can never produce invented observations.
 */
export const DIAGRAM_RETAKE_GUIDANCE =
  "Aptly couldn't review this diagram reliably, so no observations are shown. For your next attempt, try a closer, brighter photo taken flat-on with the whole diagram in the frame. This doesn't affect your written feedback.";

/**
 * Display-level reconciliation for the 4-mark diagram-explain cap when a
 * diagram photo WAS reviewed: the stored capReason ("Diagram evidence
 * missing…") would read as a contradiction next to the review card. The marks
 * themselves never change — diagram marks stay excluded in this release.
 */
export const DIAGRAM_CAP_REASON_WITH_EVIDENCE =
  "Diagram marks are not included in this estimate. Your diagram photo was reviewed separately as study feedback, not for marks. Only the written explanation is assessable in this feedback-only release — diagram review does not yet contribute to the mark estimate.";

// --- Presentation reconciliation predicates -----------------------------------
// When structured Diagram Evidence exists on an attempt, wording written for
// the no-photo world ("No image attachment was provided…", "add a fully
// labelled diagram") becomes untrue or confusing next to the review card.
// These predicates let the canonical presenters DROP such lines at display
// time only. Stored feedback, marks, assessment state, and analytics inputs
// never change; removal is the only operation (model text is never rewritten).

/**
 * A claim that no diagram/image/photo was provided, submitted, or usable —
 * e.g. "No image attachment was provided, so the diagram component could not
 * be credited." or "No diagram was submitted." Deliberately requires the
 * negation NEAR the visual noun inside one clause, so mixed sentences like
 * "Your diagram is clear, but you did not explain the shift." survive.
 */
const UNSUBMITTED_DIAGRAM_WORDING =
  /\b(no|without|missing|lacks?|lacking)\b[^.!?]{0,60}\b(diagrams?|images?|photos?|photographs?|attachments?|uploads?|drawings?)\b|\b(diagrams?|images?|photos?|photographs?|attachments?|uploads?|drawings?)\b[^.!?]{0,60}\b(not|never|wasn'?t|weren'?t|couldn'?t|could not|cannot|can'?t|unable)\b[^.!?]{0,40}\b(provided|submitted|included|attached|supplied|drawn|present|seen|credited|assessed|verified|available)\b|\b(diagrams?|images?|photos?)\b[^.!?]{0,30}\b(was|were|is|are)\b[^.!?]{0,20}\b(missing|absent)\b/i;

export function mentionsUnsubmittedDiagram(text: string): boolean {
  return UNSUBMITTED_DIAGRAM_WORDING.test(text);
}

/**
 * Generic advice that merely tells the student to ADD a diagram — stale once
 * they attached one. Advice about improving an existing diagram ("label the
 * axes of your diagram") and skill advice ("practise drawing diagrams")
 * deliberately do NOT match — bare "draw/draws a diagram" is an instruction
 * to add one; the gerund "drawing" is how ongoing practice is described.
 */
const ADD_DIAGRAM_ADVICE_WORDING =
  /\b(?:(?:add|include|provide|attach|insert|sketch|supply|submit)(?:ing|s|ed)?|draws?)\b[^.!?]{0,60}\b(diagrams?|graphs?)\b|\b(diagrams?|graphs?)\b[^.!?]{0,60}\b(would|could)\b[^.!?]{0,40}\b(help|strengthen|improve|clarify|support|earn)/i;

export function mentionsAddDiagramAdvice(text: string): boolean {
  return ADD_DIAGRAM_ADVICE_WORDING.test(text);
}

/** Component-row note replacing "Not submitted" when a photo was reviewed. */
export const DIAGRAM_COMPONENT_REVIEWED_NOTE = "Photo reviewed separately — not marked";

/** Notice when the review failed but grading succeeded (never blocking). */
export const DIAGRAM_REVIEW_UNAVAILABLE_NOTICE =
  "Your diagram photo couldn't be reviewed this time. Your written feedback above is complete and unaffected.";

const ELEMENT_LABELS: Record<DiagramElement, string> = {
  axes_labels: "Axis labels",
  curve_labels: "Curve labels",
  equilibrium: "Equilibrium point",
  shift_arrows: "Shift arrows",
  new_equilibrium: "New equilibrium",
  welfare_areas: "Welfare areas",
  annotations: "Annotations",
};

const OBSERVATION_LABELS: Record<DiagramObservation, string> = {
  visible: "Visible",
  unclear: "Unclear in the photo",
  not_visible: "Not visible in the photo",
};

const RELEVANCE_LINES: Record<DiagramRelevance, string> = {
  appears_relevant: "The diagram looks broadly relevant to this question.",
  appears_unrelated: "The diagram doesn't appear to match what this question asks about.",
  unclear: "Aptly couldn't confidently judge whether the diagram matches this question.",
};

const CONSISTENCY_LINES: Record<Exclude<DiagramConsistency, "not_checked">, string> = {
  supports: "The diagram broadly supports your written explanation.",
  conflicts:
    "The diagram appears to conflict with part of your written explanation — worth checking both.",
  unclear: "The diagram couldn't be compared confidently with your written explanation.",
};

// --- Presenter ----------------------------------------------------------------

export interface DiagramElementRow {
  label: string;
  observationLabel: string;
  observed: DiagramObservation;
}

/**
 * Everything a Diagram Evidence card renders, resolved once. Both surfaces
 * (feedback screen and Learning log) present through this single helper.
 * For "unable_to_assess" it deliberately presents NOTHING except the status
 * and retake guidance — no findings can leak through the presenter either.
 */
export interface DiagramEvidencePresentation {
  statusLabel: string;
  tone: "clear" | "partial" | "unassessable";
  /** False for unable_to_assess: no findings are shown at all. */
  showFindings: boolean;
  graphTypeLine: string | null;
  relevanceLine: string | null;
  elementRows: DiagramElementRow[];
  consistencyLine: string | null;
  improvements: string[];
  retakeGuidance: string | null;
  limitation: string;
}

export function presentDiagramEvidence(evidence: DiagramEvidence): DiagramEvidencePresentation {
  const statusLabel = DIAGRAM_REVIEW_STATUS_LABELS[evidence.status];
  if (evidence.status === "unable_to_assess") {
    return {
      statusLabel,
      tone: "unassessable",
      showFindings: false,
      graphTypeLine: null,
      relevanceLine: null,
      elementRows: [],
      consistencyLine: null,
      improvements: [],
      retakeGuidance: DIAGRAM_RETAKE_GUIDANCE,
      limitation: DIAGRAM_EVIDENCE_LIMITATION,
    };
  }
  return {
    statusLabel,
    tone: evidence.status === "reviewed_clearly" ? "clear" : "partial",
    showFindings: true,
    graphTypeLine:
      evidence.graphTypeObserved !== null ? `Appears to show: ${evidence.graphTypeObserved}` : null,
    relevanceLine: RELEVANCE_LINES[evidence.relevanceToQuestion],
    elementRows: evidence.elements.map((f) => ({
      label: ELEMENT_LABELS[f.element],
      observationLabel: OBSERVATION_LABELS[f.observed],
      observed: f.observed,
    })),
    consistencyLine:
      evidence.consistencyWithAnswer === "not_checked"
        ? null
        : CONSISTENCY_LINES[evidence.consistencyWithAnswer],
    improvements: evidence.improvements.slice(0, 2),
    retakeGuidance: null,
    limitation: DIAGRAM_EVIDENCE_LIMITATION,
  };
}
