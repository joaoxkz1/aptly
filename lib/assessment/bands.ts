import type { AssessmentFramework } from "@/lib/types";

/**
 * Deterministic IB-style best-fit band placement (IB Marking Fidelity).
 *
 * Pure, no LLM. The overall mark is judged by the framework's best-fit model;
 * this maps that mark to its recognised markband and shows where in the band the
 * answer sits. Only CONFIRMED paper frameworks get a band — generic practice and
 * the short/diagram templates never show an official-looking IB markband.
 */

// Recognised markband boundaries (inclusive). Band 0 handled separately.
const TEN_MARK_BANDS: [number, number][] = [
  [1, 2],
  [3, 4],
  [5, 6],
  [7, 8],
  [9, 10],
];
const FIFTEEN_MARK_BANDS: [number, number][] = [
  [1, 3],
  [4, 6],
  [7, 9],
  [10, 12],
  [13, 15],
];

const FRAMEWORK_BANDS: Record<AssessmentFramework, [number, number][] | null> = {
  paper1a_10_mark: TEN_MARK_BANDS,
  paper3b_10_mark: TEN_MARK_BANDS,
  paper1b_15_mark: FIFTEEN_MARK_BANDS,
  paper2g_15_mark: FIFTEEN_MARK_BANDS,
  paper2_four_mark_diagram_explain: null,
  paper2_short_analytic: null,
  // Question-specific analytic frameworks — no official markband display.
  paper2a_definition: null,
  paper2b_quantitative: null,
  paper3a_analytic: null,
  generic_practice: null,
};

/** True for frameworks that use an IB best-fit markband display. */
export function isBestFitFramework(framework: AssessmentFramework): boolean {
  return FRAMEWORK_BANDS[framework] !== null;
}

export type BandPlacement = "lower" | "middle" | "upper";

export interface BestFitBand {
  low: number;
  high: number;
  placement: BandPlacement;
}

/** The best-fit markband for an earned mark, or null when the framework has none. */
export function bestFitBand(framework: AssessmentFramework, earned: number): BestFitBand | null {
  const bands = FRAMEWORK_BANDS[framework];
  if (bands == null) return null;
  if (earned <= 0) return { low: 0, high: 0, placement: "middle" };

  const band = bands.find(([lo, hi]) => earned >= lo && earned <= hi);
  if (band == null) return null;

  const [low, high] = band;
  const span = high - low;
  let placement: BandPlacement;
  if (span === 0) {
    placement = "middle";
  } else {
    const pos = (earned - low) / span; // 0..1
    placement = pos <= 0.33 ? "lower" : pos >= 0.67 ? "upper" : "middle";
  }
  return { low, high, placement };
}

export function placementLabel(placement: BandPlacement): string {
  return placement === "lower"
    ? "lower end of the band"
    : placement === "upper"
      ? "upper end of the band"
      : "middle of the band";
}
