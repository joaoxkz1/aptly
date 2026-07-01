import type { Confidence } from "@/lib/types";

/**
 * Aptly provisional practice-readiness bands and algorithm weights/thresholds.
 *
 * Aptly provisional bands — calibrate against real outcomes later.
 * These are motivating, honest estimates, NOT official IB grade boundaries.
 * Every threshold the readiness algorithm uses lives here (never hardcoded
 * across the app) so calibration is a one-file change.
 */

// v2 adds the canonical, server-derived scoring model (scoringState,
// markTotalSource, template cap, core-analytics eligibility). Attempts written
// at v1 (or with no assessment at all) are treated as legacy and rendered
// conservatively — never reinterpreted or upgraded.
export const ASSESSMENT_VERSION = 2;

// --- Weighting -------------------------------------------------------------
// Weight an attempt by the marks Aptly actually judged: a 15-mark answer
// counts more than a 2-mark one, but no single attempt can dominate.
export const WEIGHT_MARKS_MIN = 2;
export const WEIGHT_MARKS_MAX = 15;
export const SINGLE_ATTEMPT_WEIGHT_CAP = 15;

// Recency decay (days -> multiplier).
export const RECENCY_WEIGHTS: { maxAgeDays: number; weight: number }[] = [
  { maxAgeDays: 14, weight: 1.0 },
  { maxAgeDays: 30, weight: 0.7 },
  { maxAgeDays: 60, weight: 0.45 },
  { maxAgeDays: Infinity, weight: 0.25 },
];

// Detection confidence -> multiplier (separate from evidence completeness).
export const CONFIDENCE_FACTORS: Record<Confidence, number> = {
  high: 1.0,
  medium: 0.7,
  low: 0.4,
};

// --- Baseline / tier thresholds (§6) --------------------------------------
// Below baseline, show "building your baseline" instead of a number.
export const BASELINE_MIN_ATTEMPTS = 3;
export const BASELINE_MIN_MARKS = 30;
export const BASELINE_MIN_FORMATS = 2;
export const BASELINE_MIN_SKILLS = 2;

export const TIER_THRESHOLDS = {
  early: { attempts: 3, marks: 30, formats: 2, skills: 2 },
  medium: { attempts: 6, marks: 60, papers: 2, skills: 3 },
  high: { attempts: 10, marks: 120, skills: 4 }, // plus broad-coverage + no-dominance guards
} as const;

// Range half-width (in bands) per confidence tier.
export const TIER_BASE_WIDTH = {
  building_baseline: 1.5,
  early: 1.0,
  medium: 0.5,
  high: 0.3,
} as const;

// Extra widening (added to base half-width) when the estimate is shakier.
export const WIDEN_LOW_CONFIDENCE = 0.5; // low classification confidence prevalent
export const WIDEN_NARROW_SKILLS = 0.5; // fewer than 3 distinct skills
export const WIDEN_EVIDENCE_GAPS = 0.3; // diagrams/workings repeatedly unassessed
export const WIDEN_SINGLE_STYLE = 0.5; // only one format style practised
export const MAX_HALF_WIDTH = 2.0;

/**
 * Provisional percent -> band-centre mapping (bands 1..7).
 * Buckets: 0-14→1, 15-29→2, 30-44→3, 45-58→4, 59-71→5, 72-85→6, 86-100→7.
 * Implemented as a continuous linear map (equivalent to the buckets) so the
 * range maths are smooth. Calibrate the spread later against real outcomes.
 */
export function percentToBandCentre(pct: number): number {
  const clamped = Math.min(100, Math.max(0, pct));
  return 1 + (clamped / 100) * 6;
}
