import type { Assessment, AssessmentSkill, Attempt, MarkBreakdownLabel, MistakeType } from "@/lib/types";
import { ASSESSMENT_SKILLS, ASSESSMENT_SKILL_LABELS } from "./taxonomy";
import { deriveScoringState, isCoreEligible } from "./status";
import { frameworkFormatKey, frameworkFormatLabel, topicDisplayLabel } from "./display";
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

/**
 * Only fully "marked" attempts (explicit / user-confirmed total) count toward
 * the numeric Current Economics Level and every other CORE metric. Provisional,
 * feedback-only, and legacy attempts feed qualitative analytics only (never
 * raise or lower the number). Canonical decision lives in the status helper.
 */
export const isEligible = isCoreEligible;

/** Economics attempts that carry any assessment (observed practice evidence). */
export function assessedAttempts(attempts: Attempt[]): Attempt[] {
  return attempts.filter((x) => x.subject === "Economics" && x.assessment != null);
}

/**
 * A complete, non-overlapping breakdown of a set of attempts by canonical state
 * so a display count can never leave a category unexplained. Every attempt lands
 * in exactly one bucket, so confirmed + provisional + feedbackOnly + unscored ===
 * total. Uses the canonical helpers — no new derivation or eligibility rule.
 */
export interface StateBreakdown {
  total: number;
  confirmed: number; // core-eligible marked
  provisional: number;
  feedbackOnly: number;
  unscored: number; // legacy/unscored (or any non-core, non-provisional, non-feedback state)
}

export function stateBreakdown(attempts: Attempt[]): StateBreakdown {
  const b: StateBreakdown = { total: attempts.length, confirmed: 0, provisional: 0, feedbackOnly: 0, unscored: 0 };
  for (const att of attempts) {
    if (isCoreEligible(att)) {
      b.confirmed += 1;
      continue;
    }
    const st = deriveScoringState(att);
    if (st === "provisional") b.provisional += 1;
    else if (st === "feedback_only") b.feedbackOnly += 1;
    else b.unscored += 1;
  }
  return b;
}

function eligibleAttempts(attempts: Attempt[]): Attempt[] {
  return attempts.filter(isEligible);
}

// --- Recurring-pattern honesty ----------------------------------------------
// One weakness is NEVER a recurring pattern. A pattern is named only after the
// same issue is observed across at least MIN_PATTERN_REPEATS distinct saved
// attempts, and only once at least MIN_ATTEMPTS_FOR_PATTERNS attempts exist.
// (Unassessable-diagram mistakes were already stripped at grading time, so a
// diagram Aptly cannot see can never surface here.)

export const MIN_ATTEMPTS_FOR_PATTERNS = 3;
export const MIN_PATTERN_REPEATS = 2;

export interface RecurringMistakeSummary {
  state: "building" | "none" | "patterns";
  /** Named patterns, most frequent first; each counts DISTINCT attempts. */
  patterns: { type: MistakeType; attempts: number }[];
}

export function recurringMistakeSummary(attempts: Attempt[]): RecurringMistakeSummary {
  if (attempts.length < MIN_ATTEMPTS_FOR_PATTERNS) {
    return { state: "building", patterns: [] };
  }
  const counts = new Map<MistakeType, number>();
  for (const a of attempts) {
    // Each attempt counts once per mistake type, however often it appears.
    for (const m of new Set(a.feedback.mistakes)) {
      counts.set(m, (counts.get(m) ?? 0) + 1);
    }
  }
  const patterns = [...counts.entries()]
    .filter(([, n]) => n >= MIN_PATTERN_REPEATS)
    .map(([type, n]) => ({ type, attempts: n }))
    .sort((a, b) => b.attempts - a.attempts);
  return patterns.length > 0 ? { state: "patterns", patterns } : { state: "none", patterns: [] };
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

// Group + label by the SERVER-confirmed framework (never the model's
// assessmentFormat), so a generic [15] response appears under "15-mark practice"
// and never "Paper 1(b)". Eligibility and the percent calc are unchanged.
export function performanceByFormat(attempts: Attempt[]): FormatPerformance[] {
  const E = eligibleAttempts(attempts);
  const byFormat = new Map<string, Attempt[]>();
  for (const a of E) {
    const key = frameworkFormatKey(a.assessment!);
    byFormat.set(key, [...(byFormat.get(key) ?? []), a]);
  }
  return [...byFormat.entries()]
    .map(([format, list]) => ({
      format,
      label: frameworkFormatLabel(list[0].assessment!),
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

// ============================================================================
// Canonical learning-insights engine.
//
// This is the SINGLE source for every assessment-aware insight shown on the
// Dashboard and Mistake Analytics. No page or card may independently derive a
// topic priority, skill priority, "weakest" topic, marks lost, readiness, or
// recommendation from the raw attempts array — they read this object.
// All numeric insight uses ONLY eligible attempts (exact_estimate, valid
// arithmetic). Legacy, practice-only, and incomplete attempts are excluded
// from the maths but remain visible in history elsewhere.
// ============================================================================

const MIN_TOPICS_FOR_FOCUS = 2;
const RELIABLE_TOPIC_ATTEMPTS = 2;
const MIN_ATTEMPTS_FOR_IMPROVEMENT = 3;

export type Reliability = "early_signal" | "reliable_pattern";

export interface TopicPerformanceRow {
  topicCode: string;
  topicLabel: string;
  earned: number;
  available: number;
  percent: number; // Σearned / Σavailable
  responses: number;
  reliability: Reliability;
}

export interface SkillPriorityRow {
  label: MarkBreakdownLabel;
  lost: number; // internal diagnostic scale — NOT an IB mark, never shown as one
  available: number; // internal diagnostic scale — NOT shown to students
  percentLost: number; // internal ranking signal — never shown as a percentage
  responses: number; // marked answers that exercised this skill (evidence count)
}

export interface EvidenceCoverage {
  diagramSubmitted: number;
  diagramRequiredMissing: number;
  workingsSubmitted: number;
  workingsRequiredMissing: number;
}

export interface ImprovedTopic {
  topicLabel: string;
  fromPercent: number;
  toPercent: number;
}

export type ConfidenceTierLabel = "Test this skill next" | "Developing priority" | "Established focus";

export interface NextFocus {
  skillLabel: MarkBreakdownLabel; // lead: "Weakest skill: <skillLabel>"
  topicCode: string;
  topicLabel: string; // context: "Most visible in <topicLabel>"
  percentLost: number;
  responses: number;
  reliability: Reliability;
  confidenceTier: ConfidenceTierLabel;
  headline: string; // "Evaluation and judgment in Market failure"
  explanation: string;
  whyThis: string | null; // shown only when a lower-scoring topic is skipped for weak evidence
}

export type CoverageState = "empty" | "build_coverage" | "early_signal" | "reliable_pattern";

export interface LearningInsights {
  totalAttempts: number; // all saved answers (submitted)
  validCount: number; // marked, core-eligible attempts used for numeric insight
  markedCount: number; // === validCount, named for clarity at call sites
  provisionalCount: number; // inferred totals, shown separately (never core)
  feedbackOnlyCount: number; // saved + analysed, but no reliable total
  excludedLegacy: number; // legacy/unscored attempts
  level: EconomicsLevel;
  weightedPercent: number | null;
  distinctTopics: number;
  distinctSkills: number;
  distinctFormats: number;
  topicPerformance: TopicPerformanceRow[];
  formatPerformance: FormatPerformance[];
  skillPriority: SkillPriorityRow[];
  coverage: SkillCoverage[];
  evidence: EvidenceCoverage;
  mostImproved: ImprovedTopic | null;
  nextFocus: NextFocus | null;
  coverageState: CoverageState;
  markTrend: number[]; // recent eligible mark percentages, oldest -> newest
}

// CORE ratios use the ASSESSABLE denominator (what Aptly could actually judge),
// consistent with weightedMarkPercent and markTrend. A template diagram cap
// reduces marksAssessable, so a capped answer is scored on what was assessed,
// never penalised for a diagram a text-only release cannot see.
function rawPercent(list: Attempt[]): { earned: number; available: number; percent: number } {
  let earned = 0;
  let available = 0;
  for (const a of list) {
    earned += a.assessment!.marksEarned ?? 0;
    available += a.assessment!.marksAssessable ?? 0;
  }
  return { earned, available, percent: available > 0 ? Math.round((100 * earned) / available) : 0 };
}

function groupByTopic(eligible: Attempt[]): Map<string, Attempt[]> {
  const byCode = new Map<string, Attempt[]>();
  for (const a of eligible) {
    const code = a.assessment!.syllabusTopic;
    if (code === "unknown") continue;
    byCode.set(code, [...(byCode.get(code) ?? []), a]);
  }
  return byCode;
}

function topicPerformanceRows(eligible: Attempt[]): TopicPerformanceRow[] {
  return [...groupByTopic(eligible).entries()]
    .map(([code, list]) => {
      const { earned, available, percent } = rawPercent(list);
      return {
        topicCode: code,
        topicLabel: topicDisplayLabel(code),
        earned,
        available,
        percent,
        responses: list.length,
        reliability: (list.length >= RELIABLE_TOPIC_ATTEMPTS
          ? "reliable_pattern"
          : "early_signal") as Reliability,
      };
    })
    .sort((a, b) => a.percent - b.percent);
}

function skillPriorityRows(eligible: Attempt[]): SkillPriorityRow[] {
  const map = new Map<MarkBreakdownLabel, { lost: number; available: number; responses: number }>();
  for (const a of eligible) {
    const seen = new Set<MarkBreakdownLabel>();
    for (const b of a.assessment!.markBreakdown) {
      // A diagram Aptly cannot yet inspect is not a diagnosed skill weakness —
      // exclude it from diagnostic ranking / next-focus until upload support
      // assesses a real submitted diagram.
      if (b.label === "Diagram") continue;
      const cur = map.get(b.label) ?? { lost: 0, available: 0, responses: 0 };
      cur.lost += Math.max(0, b.available - b.awarded);
      cur.available += b.available;
      if (!seen.has(b.label)) {
        cur.responses += 1; // count each marked answer once per skill
        seen.add(b.label);
      }
      map.set(b.label, cur);
    }
  }
  return [...map.entries()]
    .map(([label, v]) => ({
      label,
      lost: v.lost,
      available: v.available,
      percentLost: v.available > 0 ? Math.round((100 * v.lost) / v.available) : 0,
      responses: v.responses,
    }))
    .filter((x) => x.available > 0)
    .sort((a, b) => b.percentLost - a.percentLost || b.lost - a.lost);
}

function evidenceCoverage(assessed: Attempt[]): EvidenceCoverage {
  const e: EvidenceCoverage = {
    diagramSubmitted: 0,
    diagramRequiredMissing: 0,
    workingsSubmitted: 0,
    workingsRequiredMissing: 0,
  };
  for (const att of assessed) {
    const a = att.assessment!;
    if (a.diagramSubmitted) e.diagramSubmitted += 1;
    else if (a.diagramExpected) e.diagramRequiredMissing += 1;
    if (a.workingsSubmitted) e.workingsSubmitted += 1;
    else if (a.workingsExpected) e.workingsRequiredMissing += 1;
  }
  return e;
}

function mostImprovedTopicAssessment(eligible: Attempt[]): ImprovedTopic | null {
  let best: ImprovedTopic | null = null;
  let bestDelta = 0;
  for (const [code, list] of groupByTopic(eligible)) {
    if (list.length < MIN_ATTEMPTS_FOR_IMPROVEMENT) continue;
    const sorted = [...list].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const mid = Math.floor(sorted.length / 2);
    const older = rawPercent(sorted.slice(0, mid));
    const newer = rawPercent(sorted.slice(mid));
    const delta = newer.percent - older.percent;
    if (delta > bestDelta) {
      bestDelta = delta;
      best = {
        topicLabel: topicDisplayLabel(code),
        fromPercent: older.percent,
        toPercent: newer.percent,
      };
    }
  }
  return best;
}

function confidenceTierFor(responses: number): ConfidenceTierLabel {
  if (responses >= 4) return "Established focus";
  if (responses >= 2) return "Developing priority";
  return "Test this skill next";
}

function buildNextFocus(
  eligible: Attempt[],
  skillPriority: SkillPriorityRow[],
  topicPerformance: TopicPerformanceRow[],
  distinctTopics: number
): NextFocus | null {
  const top = skillPriority.find((s) => s.lost > 0);
  if (top == null) return null; // nothing being lost — no focus needed
  if (distinctTopics < MIN_TOPICS_FOR_FOCUS) return null; // cannot name a topic-specific priority

  // Within the top skill category, find the topic losing the most of it.
  const byTopic = new Map<string, { lost: number; available: number; list: Attempt[] }>();
  for (const a of eligible) {
    const code = a.assessment!.syllabusTopic;
    if (code === "unknown") continue;
    const cat = a.assessment!.markBreakdown.find((b) => b.label === top.label);
    if (cat == null) continue;
    const cur = byTopic.get(code) ?? { lost: 0, available: 0, list: [] };
    cur.lost += Math.max(0, cat.available - cat.awarded);
    cur.available += cat.available;
    cur.list.push(a);
    byTopic.set(code, cur);
  }
  const ranked = [...byTopic.entries()]
    .filter(([, v]) => v.available > 0 && v.lost > 0)
    .sort((a, b) => b[1].lost / b[1].available - a[1].lost / a[1].available);
  if (ranked.length === 0) return null;

  const [code, v] = ranked[0];
  const percentLost = Math.round((100 * v.lost) / v.available);
  const responses = v.list.length;
  const topicLabel = topicDisplayLabel(code);
  const reliability: Reliability =
    responses >= RELIABLE_TOPIC_ATTEMPTS ? "reliable_pattern" : "early_signal";

  // "Why this?" — only when a topic with a VISIBLY lower percent is skipped
  // because its evidence is an early signal (fewer than a reliable pattern).
  // Built strictly from stored data, never fabricated. NO marks/percentages.
  const focusRow = topicPerformance.find((t) => t.topicCode === code);
  const lowerButWeak = topicPerformance.find(
    (t) =>
      t.topicCode !== code &&
      focusRow != null &&
      t.percent < focusRow.percent &&
      t.reliability === "early_signal"
  );
  const topMarks = v.list.reduce((m, a) => Math.max(m, a.assessment!.marksAvailable ?? 0), 0);
  const evidencePhrase =
    responses === 1 && topMarks >= 1
      ? `a marked ${topMarks}-mark response`
      : `${responses} marked answer${responses === 1 ? "" : "s"}`;
  const whyThis =
    lowerButWeak != null
      ? `${topicLabel} has a stronger evidence base than your other early signals. This recommendation is based on ${evidencePhrase}, while other topic results rest on fewer or shorter answers.`
      : null;

  return {
    skillLabel: top.label,
    topicCode: code,
    topicLabel,
    percentLost,
    responses,
    reliability,
    confidenceTier: confidenceTierFor(responses),
    headline: `${top.label} in ${topicLabel}`,
    explanation: `${top.label} is the clearest diagnostic improvement signal in your marked answers so far.`,
    whyThis,
  };
}

/** The one canonical insights object. Dashboard and Analytics both read this. */
export function buildLearningInsights(attempts: Attempt[]): LearningInsights {
  const assessed = assessedAttempts(attempts);
  const eligible = eligibleAttempts(attempts);

  // Canonical, non-overlapping status counts (one attempt is counted once).
  let provisionalCount = 0;
  let feedbackOnlyCount = 0;
  let excludedLegacy = 0;
  for (const att of attempts) {
    const st = deriveScoringState(att);
    if (st === "provisional") provisionalCount += 1;
    else if (st === "feedback_only") feedbackOnlyCount += 1;
    else if (st === "legacy_unscored") excludedLegacy += 1;
  }

  const topicPerformance = topicPerformanceRows(eligible);
  const skillPriority = skillPriorityRows(eligible);
  const distinctTopics = topicPerformance.length;
  const distinctSkills = new Set(eligible.flatMap((a) => a.assessment!.assessmentSkills)).size;
  const distinctFormats = new Set(eligible.map((a) => a.assessment!.assessmentFormat)).size;

  const nextFocus = buildNextFocus(eligible, skillPriority, topicPerformance, distinctTopics);

  const markTrend = [...eligible]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-10)
    .map((a) => Math.round((100 * a.assessment!.marksEarned!) / a.assessment!.marksAssessable!));

  let coverageState: CoverageState;
  if (eligible.length === 0) coverageState = "empty";
  else if (nextFocus == null) coverageState = "build_coverage";
  else coverageState = nextFocus.reliability;

  return {
    totalAttempts: attempts.length,
    validCount: eligible.length,
    markedCount: eligible.length,
    provisionalCount,
    feedbackOnlyCount,
    excludedLegacy,
    level: currentEconomicsLevel(attempts),
    weightedPercent: weightedMarkPercent(attempts),
    distinctTopics,
    distinctSkills,
    distinctFormats,
    topicPerformance,
    formatPerformance: performanceByFormat(attempts),
    skillPriority,
    coverage: skillCoverage(attempts),
    evidence: evidenceCoverage(assessed),
    mostImproved: mostImprovedTopicAssessment(eligible),
    nextFocus,
    coverageState,
    markTrend,
  };
}
