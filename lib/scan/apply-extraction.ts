import type { ExtractedFields } from "@/lib/ai/extraction-schema";

/**
 * Fill-only-empty-fields rule (Aptly Scan) — pure, unit-tested.
 *
 * Extraction output is a CANDIDATE draft: it may fill only genuinely empty
 * fields. Text the student has typed — question, answer, or staged source —
 * is never overwritten, merged, or "completed", however partial it is and
 * however complete the image looks. The student stays in control of the final
 * reviewed text.
 */

export interface SubmitFieldState {
  /** The typed question textarea value ("" when empty). */
  question: string;
  /** The typed answer textarea value ("" when empty). */
  answer: string;
  /** Source text staged for the source-material step (null/"" when empty). */
  stagedSource: string | null;
}

export interface ExtractionFill {
  /** Value to SET, or null to leave the field exactly as it is. */
  question: string | null;
  answer: string | null;
  stagedSource: string | null;
}

function isEmpty(value: string | null): boolean {
  return value === null || value.trim() === "";
}

/** Compute what an extraction may fill. Non-empty fields are untouchable. */
export function applyExtractionToFields(
  current: SubmitFieldState,
  extracted: ExtractedFields
): ExtractionFill {
  return {
    question: isEmpty(current.question) && extracted.question !== null ? extracted.question : null,
    answer: isEmpty(current.answer) && extracted.answer !== null ? extracted.answer : null,
    stagedSource:
      isEmpty(current.stagedSource) && extracted.sourceMaterial !== null
        ? extracted.sourceMaterial
        : null,
  };
}

/** True when the fill changes at least one field. */
export function fillsAnything(fill: ExtractionFill): boolean {
  return fill.question !== null || fill.answer !== null || fill.stagedSource !== null;
}

/**
 * Pre-upload gate: when both text fields already have typed content there is
 * nothing an image may honestly fill, so no upload (and no paid extraction)
 * should happen at all.
 */
export function canFillFromScan(current: Pick<SubmitFieldState, "question" | "answer">): boolean {
  return isEmpty(current.question) || isEmpty(current.answer);
}
