import type { Attempt } from "@/lib/types";
import type { EconomicsCourseLevel, PracticeMarkTotal } from "./course-level";
import { ECONOMICS_TAXONOMY_VERSION, SYLLABUS_TOPICS, isCurrentTopLevelHlTopic } from "./taxonomy";

export const NEXT_TOPIC_PRACTICE_HREF = "/practice?mode=general&suggest=uncovered";

/** Coverage is an optional starting point, never evidence of a weakness. */
export function generalPracticeSuggestion(attempts: Attempt[], level: EconomicsCourseLevel | null): {
  topicCode: string; marks: PracticeMarkTotal; suggested: boolean;
} {
  const covered = new Set<string>(attempts.flatMap(attempt => {
    const a = attempt.assessment;
    return a?.gradingProvenance?.taxonomyVersion === ECONOMICS_TAXONOMY_VERSION && a.syllabusTopic !== "unknown"
      ? [a.syllabusTopic] : [];
  }));
  const eligible = SYLLABUS_TOPICS.filter(topic => topic !== "unknown" && (level === "hl" || !isCurrentTopLevelHlTopic(topic)));
  const uncovered = eligible.find(topic => !covered.has(topic));
  return { topicCode: uncovered ?? eligible[0], marks: 10, suggested: attempts.length > 0 && uncovered !== undefined };
}
