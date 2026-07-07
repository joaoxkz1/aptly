import type { AssessmentFramework, Attempt, MistakeType } from "@/lib/types";
import { deriveScoringState, isCoreEligible } from "./status";

/**
 * Practice Loop — pure revision helpers. No secrets, client- and server-safe.
 *
 * A revision is an independent saved attempt whose `parentAttemptId` points at
 * the attempt it revises. Chains can grow (revise a revision). Two invariants:
 *
 *  1. HISTORY IS NEVER HIDDEN. Every attempt — original and every revision —
 *     stays visible in the Learning log. Nothing here filters display lists.
 *
 *  2. INDEPENDENT EVIDENCE IS COUNTED ONCE. Repeated revisions of the same
 *     question must not inflate core analytics (current Economics level, mark
 *     trend, topic performance, next focus, marked-answer evidence counts).
 *     For core independent-evidence analytics, only the LATEST core-eligible
 *     attempt in a revision chain counts.
 */

export function isRevision(attempt: Attempt): boolean {
  return attempt.parentAttemptId != null;
}

/**
 * Group key for an attempt's revision chain: the ultimate ancestor's id.
 * Parents are followed within the provided id map; a dangling parent id (the
 * original was deleted mid-session before the DB nulled the link, or the list
 * is partial) is still used as the group key so sibling revisions of the same
 * missing original never double-count. A cycle guard makes corrupt data safe.
 */
function chainRootId(attempt: Attempt, byId: Map<string, Attempt>): string {
  let current = attempt;
  const seen = new Set<string>([current.id]);
  while (current.parentAttemptId != null) {
    const parent = byId.get(current.parentAttemptId);
    if (parent == null) return current.parentAttemptId; // dangling link — stable key
    if (seen.has(parent.id)) {
      // Defensive cycle guard (corrupt data): every member of the cycle must
      // resolve to the SAME key whatever the entry point — use the smallest id.
      return [...seen].sort()[0];
    }
    seen.add(parent.id);
    current = parent;
  }
  return current.id;
}

/**
 * THE revision-chain analytics rule: from all attempts, return the core-
 * eligible ones with each revision chain collapsed to its LATEST eligible
 * attempt. Attempts outside any chain pass through unchanged. Idempotent —
 * re-applying to an already-collapsed list changes nothing.
 */
export function collapseRevisionChains(attempts: Attempt[]): Attempt[] {
  const byId = new Map(attempts.map((a) => [a.id, a]));
  const latestByRoot = new Map<string, Attempt>();

  for (const a of attempts) {
    if (!isCoreEligible(a)) continue;
    const root = chainRootId(a, byId);
    const current = latestByRoot.get(root);
    if (
      current == null ||
      new Date(a.createdAt).getTime() > new Date(current.createdAt).getTime()
    ) {
      latestByRoot.set(root, a);
    }
  }

  const kept = new Set([...latestByRoot.values()].map((a) => a.id));
  // Preserve the caller's ordering (lists arrive newest-first from storage).
  return attempts.filter((a) => kept.has(a.id));
}

// --- Revision comparison -----------------------------------------------------

export interface RevisionComparison {
  /** "8 / 10" */
  previousFraction: string;
  /** "9 / 10" */
  revisionFraction: string;
  /** revision earned − previous earned (may be negative or zero). */
  deltaMarks: number;
  /** "+1 mark", "−2 marks", "no change" */
  deltaLabel: string;
}

function frameworkOf(attempt: Attempt): AssessmentFramework | null {
  return attempt.assessment?.framework ?? null;
}

/**
 * A restrained, honest comparison between a revision and its original —
 * returned ONLY when the two estimates are genuinely comparable:
 *  - both attempts are fully "marked" (canonical state),
 *  - their confirmed totals match,
 *  - their marking frameworks are compatible (same framework).
 * Provisional and feedback-only attempts are NEVER compared numerically, and
 * nothing here implies an official grade increase.
 */
export function revisionComparison(
  parent: Attempt,
  revision: Attempt
): RevisionComparison | null {
  if (deriveScoringState(parent) !== "marked") return null;
  if (deriveScoringState(revision) !== "marked") return null;

  const p = parent.assessment;
  const r = revision.assessment;
  if (p == null || r == null) return null;
  if (p.marksAvailable == null || r.marksAvailable == null) return null;
  if (p.marksAvailable !== r.marksAvailable) return null;
  if (p.marksEarned == null || r.marksEarned == null) return null;

  const pf = frameworkOf(parent);
  const rf = frameworkOf(revision);
  if (pf == null || rf == null || pf !== rf) return null;

  const delta = r.marksEarned - p.marksEarned;
  const deltaLabel =
    delta === 0
      ? "no change"
      : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} mark${Math.abs(delta) === 1 ? "" : "s"}`;

  return {
    previousFraction: `${p.marksEarned} / ${p.marksAvailable}`,
    revisionFraction: `${r.marksEarned} / ${r.marksAvailable}`,
    deltaMarks: delta,
    deltaLabel,
  };
}

// --- Revision issue follow-up (Beta Trust) ------------------------------------
//
// Aptly re-marks every revision as a FRESH answer: the grading request carries
// no parent feedback, so the model never re-checks earlier issues one by one.
// Without this section, an issue tag that simply isn't re-flagged looks like
// Aptly forgot its own feedback. The follow-up below is a pure PRESENTATION
// rule over the controlled MistakeType tags (enum identity, never fuzzy text
// matching): a parent tag present in the revision's own tags is "still
// flagged"; an absent tag is honestly "not re-flagged — not verified as
// fixed". Aptly NEVER claims a prior issue was addressed, because independent
// re-marking produces no evidence for that claim. Stored feedback and marks
// are never rewritten.

export type RevisionIssueStatus = "still_flagged" | "not_reflagged";

export interface RevisionIssueFollowUpItem {
  type: MistakeType;
  status: RevisionIssueStatus;
}

/** Student-facing wording for each follow-up status — never a "fixed" claim. */
export const REVISION_ISSUE_STATUS_LABELS: Record<RevisionIssueStatus, string> = {
  still_flagged: "Still flagged in this revision",
  not_reflagged: "Not flagged this time — not re-checked individually",
};

/** The one honest explainer shown with the follow-up list. */
export const REVISION_FOLLOWUP_EXPLAINER =
  "Aptly marks each revision as a fresh answer, so it doesn't re-check earlier issues one by one. Judge each point against your revised answer yourself.";

/**
 * Follow-up rows for every issue flagged on the ORIGINAL attempt. Pure and
 * deterministic: controlled-tag identity only. Returns [] when the parent had
 * no flagged issues (nothing to follow up).
 */
export function revisionIssueFollowUp(
  parent: Attempt,
  revision: Attempt
): RevisionIssueFollowUpItem[] {
  const revisionTags = new Set(revision.feedback.mistakes);
  // De-duplicate defensively; stored tags should already be unique.
  return [...new Set(parent.feedback.mistakes)].map((type) => ({
    type,
    status: revisionTags.has(type) ? "still_flagged" : "not_reflagged",
  }));
}

// --- Trusted revision prefill context ---------------------------------------

export interface RevisionContext {
  /** DATABASE id of the attempt being revised. */
  parentId: string;
  /** The original question, prefixed nowhere — prefilled read-only. */
  question: string;
  /** Same generated practice question, when the original answered one. */
  practiceQuestionId: string | null;
  /**
   * The student's previously CONFIRMED total (user_confirmed source only) —
   * the one denominator that is not re-detectable from the question text.
   * Null when the total was explicit/inferred (the server re-detects those).
   */
  confirmedTotal: number | null;
  /**
   * The framework the student previously confirmed for an ambiguous 10/15
   * total. Passed back as `requestedFramework`; the server only honours it
   * when it is among ITS OWN detected options — never blindly trusted.
   */
  preferredFramework: AssessmentFramework | null;
  /**
   * The parent's privately RETAINED manual source text (Paper 2(g)/3(b)),
   * when it was stored with the parent attempt. Grading retrieves it
   * server-side from the parent row — this copy is for the read-only
   * reference panel and for carrying the same source onto the saved revision.
   */
  storedSource: string | null;
  /**
   * True when the original was a source-dependent Paper 2(g)/3(b) attempt and
   * NO source is safely stored anywhere (no retained manual copy, no Aptly-
   * generated source) — the student must paste the source text again for a
   * source-based estimate (feedback-only stays available). Pre-patch
   * source-backed attempts land here exactly once; their revision stores the
   * re-pasted source for every later revision.
   */
  needsSourceAgain: boolean;
}

const PAPER_FRAMEWORKS: readonly AssessmentFramework[] = [
  "paper1a_10_mark",
  "paper1b_15_mark",
  "paper2g_15_mark",
  "paper3b_10_mark",
];

/**
 * Derive the trusted context a revision may safely inherit from its original:
 * the known confirmed mark total, a safely established framework, and any
 * generated-practice link. The student's old ANSWER is never carried into the
 * editable field, and pasted source material is never silently reused (it is
 * not stored for pasted questions).
 */
export function revisionContextFor(parent: Attempt): RevisionContext {
  const a = parent.assessment ?? null;
  const practiceQuestionId = parent.practiceQuestionId ?? null;

  const confirmedTotal =
    a?.markTotalSource === "user_confirmed" && a.marksAvailable != null ? a.marksAvailable : null;

  const preferredFramework =
    a?.framework != null && (PAPER_FRAMEWORKS as readonly string[]).includes(a.framework)
      ? a.framework
      : null;

  const sourceFramework =
    a?.framework === "paper2g_15_mark" || a?.framework === "paper3b_10_mark";

  // The parent's privately retained manual source (post-patch attempts only).
  const rawStored = parent.sourceMaterial;
  const storedSource =
    sourceFramework && typeof rawStored === "string" && rawStored.trim() !== ""
      ? rawStored
      : null;

  // A re-paste is needed only when NO stored source exists anywhere: a
  // generated 2(g)/3(b) practice question keeps its Aptly-generated source in
  // practice_questions, and a post-patch manual attempt retains its pasted
  // source on its own row — grading retrieves both server-side.
  const needsSourceAgain = sourceFramework && practiceQuestionId == null && storedSource == null;

  return {
    parentId: parent.id,
    question: parent.question,
    practiceQuestionId,
    confirmedTotal,
    preferredFramework,
    storedSource,
    needsSourceAgain,
  };
}
