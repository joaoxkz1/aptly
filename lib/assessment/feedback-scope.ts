import type { Assessment, Attempt, Feedback } from "@/lib/types";
import { answerPracticeFocus, FOCUS_INSTRUCTIONS } from "./focused-practice";

const OPTIONAL_PREFIX = "Optional extension (not needed for credit): ";
const OPTIONAL_START = /^\s*optional(?:\s+extension)?(?:\s*\([^)]*\))?\s*:\s*/i;

function requestsRecommendation(question: string): boolean {
  // A policy topic or an instruction to discuss its effects does not itself
  // request a recommendation. Keep this limited to explicit task wording.
  return /\b(?:recommend|propose)\b/i.test(question) ||
    /\b(?:suggest|select|choose)\b[^.!?]{0,80}\bpolic(?:y|ies)\b/i.test(question) ||
    /\b(?:give|make|provide)\b[^.!?]{0,60}\b(?:policy\s+)?recommendation\b/i.test(question) ||
    /\b(?:which|what)\s+(?:(?:economic|government|fiscal|monetary)\s+)?polic(?:y|ies)\b[^.!?]{0,120}\b(?:best|most appropriate|should be (?:adopted|used|chosen))\b/i.test(question) ||
    /\b(?:best|most appropriate)\s+(?:(?:economic|government|fiscal|monetary)\s+)?polic(?:y|ies)\b/i.test(question);
}

function seeksRecommendation(text: string): boolean {
  return /\b(?:finish|end|conclude|add|include|provide|give|make|develop|state|offer)\b[^.!?]{0,120}\b(?:policy\s+)?recommendation\b/i.test(text) ||
    /\bpolicy recommendation\b[^.!?]{0,40}\b(?:needed|required|missing|lacking)\b/i.test(text) ||
    /\b(?:recommend|propose|choose|select|prioriti[sz]e)\b[^.!?]{0,120}\b(?:polic(?:y|ies)|response|measure|intervention)\b/i.test(text) ||
    /\b(?:polic(?:y|ies)|policy response)\b[^.!?]{0,100}\b(?:most appropriate|best|should be adopted|preferable)\b/i.test(text);
}

function diagnosedAction(feedback: Feedback, assessment: Assessment, question: string): string | null {
  // Reuse the same saved-evidence priority policy as Next Step. This transient
  // view is never persisted and creates no new assessment or scoring rule.
  const view: Attempt = {
    id: "feedback-scope", createdAt: "1970-01-01T00:00:00Z", subject: "Economics",
    topic: assessment.syllabusTopic, question, answer: "", feedback, assessment,
  };
  const focus = answerPracticeFocus(view);
  return focus && Object.hasOwn(FOCUS_INSTRUCTIONS, focus.targetSkill)
    ? FOCUS_INSTRUCTIONS[focus.targetSkill as keyof typeof FOCUS_INSTRUCTIONS]
    : null;
}

/** Keep corrective advice within the question; never change assessment marks. */
export function scopeFeedbackToQuestion(feedback: Feedback, assessment: Assessment, question: string): Feedback {
  const recommendationRequired = requestsRecommendation(question);
  const fullCredit = assessment.marksEarned !== null && assessment.marksEarned === assessment.marksAvailable;
  const action = fullCredit ? null : diagnosedAction(feedback, assessment, question);
  const improvements = feedback.improvements.flatMap(text => {
    if (!recommendationRequired && seeksRecommendation(text)) return [];
    if (OPTIONAL_START.test(text)) return [OPTIONAL_PREFIX + text.replace(OPTIONAL_START, "")];
    return [text];
  });
  const optionalNextStep = OPTIONAL_START.test(feedback.studyNext);
  const outOfScopeNextStep = !recommendationRequired && seeksRecommendation(feedback.studyNext);
  const fallback = action ?? improvements.find(text => text.trim() && !OPTIONAL_START.test(text))
    ?? "Review the feedback for this question and address any stated limitations.";
  const studyNext = outOfScopeNextStep || optionalNextStep && action !== null ? fallback
    : optionalNextStep ? OPTIONAL_PREFIX + feedback.studyNext.replace(OPTIONAL_START, "") : feedback.studyNext;
  return { ...feedback, improvements, studyNext };
}
