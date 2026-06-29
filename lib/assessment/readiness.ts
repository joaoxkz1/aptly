import type { Assessment, AssessmentSkill, Attempt, MarkBreakdownLabel } from "@/lib/types";
import {
  ASSESSMENT_FORMAT_LABELS,
  ASSESSMENT_SKILLS,
  ASSESSMENT_SKILL_LABELS,
} from "./taxonomy";
import {
  BASELINE_MIN_ATTEMPTS,
  BASELINE_MIN_FORMATS,
  BASELINE_MIN_MARKS,
  BASELINE_MIN_SKILLS,
  CONFIDENCE_FACTORS,
  MAX_HALF_WIDTH,
  RECENCY_WEIGHTS,
  SINGLE_ATTEMPT_WEIGHT_CAP,
  TIER_BASE_WIDTH,
  TIER_THRESHOLDS,
  WEIGHT_MARKS_MAX,
  WEIGHT_MARKS_MIN,
  WIDEN_EVIDENCE_GAPS,
  WIDEN_LOW_CONFIDENCE,
  WIDEN_NARROW_SKILLS,
  WIDEN_SINGLE_STYLE,
  percentToBandCentre,
} from "./config";

/** Pure readiness math. No AI. Consumes the fetched Attempt[]. */

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function ageDays(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000);
}

function recencyWeight(iso: string): number {
  const d = ageDays(iso);
  for (const bucket of RECENCY_WEIGHTS) {
    if (d <= bucket.maxAgeDays) return bucket.weight;
  }
  return RECENCY_WEIGHTS[RECENCY_WEIGHTS.length - 1].weight;
}

function weightForMarks(a: Assessment): number {
  return clamp(a.marksAssessable ?? 0, WEIGHT_MARKS_MIN, WEIGHT_MARKS_MAX);
}

/** Defensive re-check of the mark invariants (validator enforced these at insert). */
function validArithmetic(a: Assessment): boolean {
  if (a.marksAvailable == null || a.marksAssessable == null || a.marksEarned == null) return false;
  if (!(a.marksEarned >= 0 && a.marksEarned <= a.marksAssessable)) return false;
  if (!(a.marksAssessable <= a.marksAvailable)) return false;
  if (a.markBreakdown.length > 0) {
    const awarded = a.markBreakdown.reduce((s, b) => s + b.awarded, 0);
    const available = a.markBreakdown.reduce((s, b) => s + b.available, 0);
    if (awarded !== a.marksEarned || available !== a.marksAssessable) return false;
  }
  return true;
}

/**
 * Only exact, fully assessed, reliably marked attempts count toward the
 * numeric Current Economics Level. partial/practice attempts feed qualitative
 * analytics only (never raise or lower the number).
 */
export function isEligible(attempt: Attempt): boolean {
  const a = attempt.assessment;
  if (attempt.subject !== "Economics" || a == null) return false;
  return (
    a.markDisplayMode === "exact_estimate" &&
    a.marksSource !== "not_reliably_known" &&
    a.marksAvailable != null &&
    a.marksAssessable != null &&
    a.marksAssessable >= 1 &&
    a.marksEarned != null &&
    validArithmetic(a)
  );
}

/** Economics attempts that carry any assessment (used for qualitative analytics). */
export function assessedAttempts(attempts: Attempt[]): Attempt[] {
  return attempts.filter((x) => x.subject === "Economics" && x.assessment != null);
}

function eligibleAttempts(attempts: Attempt[]): Attempt[] {
  return attempts.filter(isEligible);
}

/** "Weighted practice mark NN%" — ratio of earned/assessable, mark- & recency-weighted. */
export function weightedMarkPercent(attempts: Attempt[]): number | null {
  const E = eligibleAttempts(attempts);
  let num = 0;
  let den = 0;
  for (const att of E) {
    const a = att.assessment!;
    const w =
      Math.min(weightForMarks(a), SINGLE_ATTEMPT_WEIGHT_CAP) *
      recencyWeight(att.createdAt) *
      CONFIDENCE_FACTORS[a.markingConfidence];
    num += w * (a.marksEarned! / a.marksAssessable!);
    den += w;
  }
  return den > 0 ? Math.round((100 * num) / den) : null;
}

function distinct<T>(xs: T[]): Set<T> {
  return new Set(xs);
}

export type ConfidenceTier = "early" | "medium" | "high";

export type EconomicsLevel =
  | { state: "building_baseline"; responses: number; assessedMarks: number }
  | {
      state: ConfidenceTier;
      low: number;
      high: number;
      weightedPercent: number;
      responses: number;
      assessedMarks: number;
    };

function confidenceTier(
  count: number,
  marks: number,
  formats: Set<string>,
  skills: Set<string>,
  papers: Set<string>,
  noDominance: boolean
): ConfidenceTier {
  const h = TIER_THRESHOLDS.high;
  const m = TIER_THRESHOLDS.medium;
  const broadCoverage = skills.size >= h.skills && formats.size >= 3;
  if (count >= h.attempts && marks >= h.marks && broadCoverage && noDominance) return "high";
  if (count >= m.attempts && marks >= m.marks && (papers.size >= m.papers || skills.size >= m.skills))
    return "medium";
  return "early";
}

export function currentEconomicsLevel(attempts: Attempt[]): EconomicsLevel {
  const E = eligibleAttempts(attempts);
  const marks = E.reduce((s, a) => s + (a.assessment!.marksAssessable ?? 0), 0);
  const formats = distinct(E.map((a) => a.assessment!.assessmentFormat));
  const papers = distinct(E.map((a) => a.assessment!.paper));
  const skills = distinct(E.flatMap((a) => a.assessment!.assessmentSkills));

  if (
    E.length < BASELINE_MIN_ATTEMPTS ||
    marks < BASELINE_MIN_MARKS ||
    (formats.size < BASELINE_MIN_FORMATS && skills.size < BASELINE_MIN_SKILLS)
  ) {
    return { state: "building_baseline", responses: E.length, assessedMarks: marks };
  }

  const pct = weightedMarkPercent(E) ?? 0;
  const centre = percentToBandCentre(pct);

  // No single format may dominate (>60% of eligible attempts).
  const maxFormatShare = Math.max(
    ...[...formats].map((f) => E.filter((a) => a.assessment!.assessmentFormat === f).length / E.length)
  );
  const noDominance = maxFormatShare <= 0.6;

  let tier = confidenceTier(E.length, marks, formats, skills, papers, noDominance);

  // Guard: only definitions practised -> never high-confidence.
  const onlyDefinitions = skills.size === 1 && skills.has("definition");
  if (onlyDefinitions && tier !== "early") tier = "early";

  // Half-width: base per tier, widened when the estimate is shakier.
  let width: number = TIER_BASE_WIDTH[tier];
  const lowConfShare =
    E.filter(
      (a) =>
        a.assessment!.classificationConfidence === "low" || a.assessment!.markingConfidence === "low"
    ).length / E.length;
  if (lowConfShare >= 0.5) width += WIDEN_LOW_CONFIDENCE;
  if (skills.size < 3) width += WIDEN_NARROW_SKILLS;
  if (formats.size < 2) width += WIDEN_SINGLE_STYLE;
  const evidenceGapShare =
    E.filter(
      (a) =>
        (a.assessment!.diagramExpected &&
          a.assessment!.diagramAssessmentStatus === "unable_to_assess") ||
        (a.assessment!.workingsExpected &&
          a.assessment!.workingsAssessmentStatus === "unable_to_assess")
    ).length / E.length;
  if (evidenceGapShare >= 0.34) width += WIDEN_EVIDENCE_GAPS;
  width = Math.min(width, MAX_HALF_WIDTH);

  const low = clamp(Math.round(centre - width), 1, 7);
  const high = Math.max(low, clamp(Math.round(centre + width), 1, 7));

  return { state: tier, low, high, weightedPercent: pct, responses: E.length, assessedMarks: marks };
}

// --- Analytics --------------------------------------------------------------

export interface FormatPerformance {
  format: string;
  label: string;
  percent: number;
  responses: number;
}

export function performanceByFormat(attempts: Attempt[]): FormatPerformance[] {
  const E = eligibleAttempts(attempts);
  const byFormat = new Map<string, Attempt[]>();
  for (const a of E) {
    const key = a.assessment!.assessmentFormat;
    byFormat.set(key, [...(byFormat.get(key) ?? []), a]);
  }
  return [...byFormat.entries()]
    .map(([format, list]) => ({
      format,
      label: ASSESSMENT_FORMAT_LABELS[format as keyof typeof ASSESSMENT_FORMAT_LABELS] ?? format,
      percent: weightedMarkPercent(list) ?? 0,
      responses: list.length,
    }))
    .sort((a, b) => a.percent - b.percent);
}

export interface MarksLostItem {
  label: MarkBreakdownLabel;
  lost: number;
  available: number;
}

export function marksLostByCategory(attempts: Attempt[]): MarksLostItem[] {
  const map = new Map<MarkBreakdownLabel, { lost: number; available: number }>();
  for (const att of attempts) {
    const a = att.assessment;
    if (a == null || a.markBreakdown.length === 0) continue;
    for (const b of a.markBreakdown) {
      const cur = map.get(b.label) ?? { lost: 0, available: 0 };
      cur.lost += Math.max(0, b.available - b.awarded);
      cur.available += b.available;
      map.set(b.label, cur);
    }
  }
  return [...map.entries()]
    .map(([label, v]) => ({ label, ...v }))
    .filter((x) => x.available > 0)
    .sort((a, b) => b.lost - a.lost);
}

export interface SkillCoverage {
  skill: AssessmentSkill;
  label: string;
  responses: number;
}

export function skillCoverage(attempts: Attempt[]): SkillCoverage[] {
  const assessed = assessedAttempts(attempts);
  const counts = new Map<AssessmentSkill, number>();
  for (const s of ASSESSMENT_SKILLS) counts.set(s, 0);
  for (const att of assessed) {
    for (const s of att.assessment!.assessmentSkills) {
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([skill, responses]) => ({ skill, label: ASSESSMENT_SKILL_LABELS[skill], responses }))
    .sort((a, b) => a.responses - b.responses);
}

/** Upgraded Study Next: combines weakest format, most-lost skill, and topic gap. */
export function assessmentStudyNext(attempts: Attempt[]): string | null {
  const E = eligibleAttempts(attempts);
  if (E.length === 0) return null;

  const formats = performanceByFormat(attempts);
  const lost = marksLostByCategory(attempts);
  const weakestFormat = formats[0];
  const topLost = lost[0];

  if (weakestFormat == null && topLost == null) return null;

  const parts: string[] = [];
  if (weakestFormat != null) {
    parts.push(
      `your ${weakestFormat.label} answers average ${weakestFormat.percent}%` +
        (formats.length > 1 ? ` (your weakest format)` : "")
    );
  }
  if (topLost != null && topLost.lost > 0) {
    const pctLost = Math.round((100 * topLost.lost) / topLost.available);
    parts.push(`you are losing the most marks on "${topLost.label}" (${pctLost}% of those marks)`);
  }
  if (parts.length === 0) return null;
  return `Focus next on ${parts.join(", and ")}. Practise a fresh question that targets it.`;
}

export interface TopicRecommendation {
  topicCode: string;
  topicLabel: string;
  reason: string;
}

function mostCommonLabel(list: Attempt[]): string {
  const counts = new Map<string, number>();
  for (const a of list) {
    const label = a.assessment?.topicLabel?.trim();
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  let best = "";
  let bestN = 0;
  for (const [label, n] of counts) {
    if (n > bestN) {
      best = label;
      bestN = n;
    }
  }
  return best || "this topic";
}

/**
 * Assessment-aware weakest-topic recommendation. Uses controlled syllabusTopic
 * codes (never the free-text attempt.topic) so the "only topic I happened to
 * practise" is not mistaken for "my weakest topic". Returns null when there is
 * not enough varied, reliable evidence to name a weak topic.
 */
export function assessmentTopicRecommendation(attempts: Attempt[]): TopicRecommendation | null {
  // Valid evidence: assessment-aware, a real topic code, and not practice-only.
  const valid = attempts.filter(
    (a) =>
      a.subject === "Economics" &&
      a.assessment != null &&
      a.assessment.syllabusTopic !== "unknown" &&
      a.assessment.markDisplayMode !== "practice_feedback_only"
  );

  const byCode = new Map<string, Attempt[]>();
  for (const a of valid) {
    const code = a.assessment!.syllabusTopic;
    byCode.set(code, [...(byCode.get(code) ?? []), a]);
  }
  // Gate 1: need at least 2 distinct controlled topic codes with valid evidence.
  if (byCode.size < 2) return null;

  const scored = [...byCode.entries()].map(([code, list]) => {
    let num = 0;
    let den = 0;
    for (const a of list) {
      const asmt = a.assessment!;
      if (asmt.marksEarned != null && asmt.marksAssessable != null && asmt.marksAssessable > 0) {
        num += asmt.marksEarned / asmt.marksAssessable;
        den += 1;
      }
    }
    const avgRatio = den > 0 ? num / den : 1;
    // A repeated mistake pattern = a mistake type present in >= 2 of the topic's attempts.
    const mistakeCounts = new Map<string, number>();
    for (const a of list) {
      for (const m of a.feedback.mistakes) mistakeCounts.set(m, (mistakeCounts.get(m) ?? 0) + 1);
    }
    let repeatedMistake: string | null = null;
    for (const [m, c] of mistakeCounts) {
      if (c >= 2) {
        repeatedMistake = m;
        break;
      }
    }
    return { code, list, avgRatio, repeatedMistake };
  });

  // Gate 2: the proposed topic needs >= 2 valid attempts, or a repeated mistake
  // pattern across >= 2 valid attempts in that topic.
  const candidates = scored.filter((s) => s.list.length >= 2 || s.repeatedMistake !== null);
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.avgRatio - b.avgRatio || b.list.length - a.list.length);
  const weakest = candidates[0];
  const avgPct = Math.round(weakest.avgRatio * 100);
  const reason =
    weakest.repeatedMistake !== null
      ? `You repeated the same issue (${weakest.repeatedMistake.toLowerCase()}) across ${weakest.list.length} marked answers here.`
      : `Your average there is ${avgPct}% across ${weakest.list.length} marked answers — the lowest of your covered topics.`;

  return { topicCode: weakest.code, topicLabel: mostCommonLabel(weakest.list), reason };
}
