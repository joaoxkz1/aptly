import type { Attempt, MistakeType, Subject } from "./types";
import { MISTAKE_TYPES } from "./types";

/** All derived stats are computed client-side from the attempts array. */

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function attemptsThisWeek(attempts: Attempt[]): Attempt[] {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return attempts.filter((a) => new Date(a.createdAt).getTime() >= cutoff);
}

export function averageScore(attempts: Attempt[]): number | null {
  if (attempts.length === 0) return null;
  const sum = attempts.reduce((s, a) => s + a.feedback.score, 0);
  return Math.round((sum / attempts.length) * 10) / 10;
}

/** Consecutive days with at least one attempt, counting back from today (or yesterday). */
export function currentStreak(attempts: Attempt[]): number {
  const days = new Set(
    attempts.map((a) => startOfDay(new Date(a.createdAt)).getTime())
  );
  const dayMs = 24 * 60 * 60 * 1000;
  let cursor = startOfDay(new Date()).getTime();
  if (!days.has(cursor)) cursor -= dayMs; // streak survives if today has no attempt yet
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= dayMs;
  }
  return streak;
}

export interface TopicStat {
  subject: Subject;
  topic: string;
  count: number;
  avgScore: number;
  mistakes: number;
}

export function topicStats(attempts: Attempt[]): TopicStat[] {
  const map = new Map<string, TopicStat & { total: number }>();
  for (const a of attempts) {
    const key = `${a.subject}::${a.topic}`;
    const cur =
      map.get(key) ??
      ({ subject: a.subject, topic: a.topic, count: 0, avgScore: 0, mistakes: 0, total: 0 });
    cur.count += 1;
    cur.total += a.feedback.score;
    cur.mistakes += a.feedback.mistakes.length;
    map.set(key, cur);
  }
  return [...map.values()].map(({ total, ...rest }) => ({
    ...rest,
    avgScore: Math.round((total / rest.count) * 10) / 10,
  }));
}

export function weakestTopic(attempts: Attempt[]): TopicStat | null {
  const stats = topicStats(attempts);
  if (stats.length === 0) return null;
  return stats.sort(
    (a, b) => a.avgScore - b.avgScore || b.mistakes - a.mistakes
  )[0];
}

export function mistakeCounts(attempts: Attempt[]): { type: MistakeType; count: number }[] {
  const counts = new Map<MistakeType, number>(MISTAKE_TYPES.map((t) => [t, 0]));
  for (const a of attempts) {
    for (const m of a.feedback.mistakes) {
      counts.set(m, (counts.get(m) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

export interface Recommendation {
  topic: string;
  subject: Subject;
  reason: string;
}

/**
 * Mock "Study Next" logic: look at the last 5 attempts, find the most
 * frequent mistake type and the topic where it occurs most, and build a
 * human-sounding reason. Falls back to the weakest topic overall.
 */
export function studyNextRecommendation(attempts: Attempt[]): Recommendation | null {
  if (attempts.length === 0) return null;
  const recent = attempts.slice(0, 5);

  const mistakeFreq = new Map<MistakeType, number>();
  for (const a of recent) {
    for (const m of a.feedback.mistakes) {
      mistakeFreq.set(m, (mistakeFreq.get(m) ?? 0) + 1);
    }
  }
  const top = [...mistakeFreq.entries()].sort((a, b) => b[1] - a[1])[0];

  if (top !== undefined && top[1] >= 2) {
    const [mistake, n] = top;
    const withMistake = recent.filter((a) => a.feedback.mistakes.includes(mistake));
    const topicFreq = new Map<string, { subject: Subject; count: number }>();
    for (const a of withMistake) {
      const cur = topicFreq.get(a.topic) ?? { subject: a.subject, count: 0 };
      cur.count += 1;
      topicFreq.set(a.topic, cur);
    }
    const [topic, info] = [...topicFreq.entries()].sort((a, b) => b[1].count - a[1].count)[0];
    const label = mistake.toLowerCase().replace("lack of evaluation", "evaluation");
    return {
      topic,
      subject: info.subject,
      reason: `You made ${n} ${shortMistakeLabel(mistake)} mistake${n === 1 ? "" : "s"} in your last ${recent.length} answers${label !== mistake.toLowerCase() ? "" : ""} — most of them on ${topic}.`,
    };
  }

  const weakest = weakestTopic(attempts);
  if (weakest === null) return null;
  return {
    topic: weakest.topic,
    subject: weakest.subject,
    reason: `Your average on ${weakest.topic} is ${weakest.avgScore}/7 — the lowest across your topics.`,
  };
}

function shortMistakeLabel(m: MistakeType): string {
  switch (m) {
    case "Lack of evaluation":
      return "evaluation";
    case "Weak definitions":
      return "definition";
    case "Missing diagram explanation":
      return "diagram";
    case "No real-world example":
      return "example";
    case "Calculation/setup error":
      return "calculation";
    case "Unclear structure":
      return "structure";
  }
}

/**
 * Mock "most improved" logic: for each topic with 2+ attempts, compare the
 * average of the older half vs the newer half of its attempts.
 */
export function mostImprovedTopic(
  attempts: Attempt[]
): { topic: string; subject: Subject; from: number; to: number } | null {
  const byTopic = new Map<string, Attempt[]>();
  for (const a of attempts) {
    const list = byTopic.get(a.topic) ?? [];
    list.push(a);
    byTopic.set(a.topic, list);
  }
  let best: { topic: string; subject: Subject; from: number; to: number; delta: number } | null =
    null;
  for (const [topic, list] of byTopic) {
    if (list.length < 2) continue;
    const sorted = [...list].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const mid = Math.floor(sorted.length / 2);
    const older = sorted.slice(0, mid);
    const newer = sorted.slice(mid);
    const avg = (xs: Attempt[]) => xs.reduce((s, a) => s + a.feedback.score, 0) / xs.length;
    const from = Math.round(avg(older) * 10) / 10;
    const to = Math.round(avg(newer) * 10) / 10;
    const delta = to - from;
    if (delta > 0 && (best === null || delta > best.delta)) {
      best = { topic, subject: sorted[0].subject, from, to, delta };
    }
  }
  if (best === null) return null;
  const { topic, subject, from, to } = best;
  return { topic, subject, from, to };
}

/** Last N scores, oldest → newest, for the sparkline. */
export function scoreTrend(attempts: Attempt[], n = 10): number[] {
  return [...attempts]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-n)
    .map((a) => a.feedback.score);
}
