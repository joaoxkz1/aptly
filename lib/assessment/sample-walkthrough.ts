import type { Attempt } from "@/lib/types";
import { ASSESSMENT_VERSION } from "./config";

/**
 * "Use a sample answer" onboarding walkthrough — pure, deterministic, no AI.
 *
 * The sample question carries an explicit `[10]` so the EXISTING mark-total
 * detection recognises it with no manual step. Viewing the sample feedback
 * renders the fixed example attempt below through the normal feedback
 * presentation components — it never calls /api/grade, never consumes the
 * grading limit, and is never persisted, so it cannot appear in the Learning
 * log or influence any analytics.
 *
 * NOT A SECOND GRADING ENGINE: this is one hand-written example result for
 * one fixed answer. The only "logic" here is the strict equality check that
 * decides whether the sample paths are offered — the moment the student edits
 * either field, everything follows the normal real-grading flow.
 */

export const SAMPLE_QUESTION =
  "Discuss whether a subsidy is the best policy to correct the underconsumption of vaccines. [10]";

export const SAMPLE_ANSWER = [
  "Vaccines create positive externalities of consumption because the social benefit is greater than the private benefit. Therefore, in a free market, too few vaccines may be consumed compared with the socially optimal quantity.",
  "A subsidy to vaccine providers would lower their costs of production and shift supply to the right. This would reduce the price paid by consumers and increase the quantity of vaccines consumed. If price is the main barrier, this could move consumption closer to the social optimum. For example, a government could fund free influenza vaccinations for older adults, increasing uptake while reducing the risk of infection spreading to others.",
  "However, a subsidy may not always be the best policy. It has an opportunity cost because government spending on vaccines cannot be used for other priorities. In addition, if vaccine hesitancy, misinformation, or poor access to clinics are the main causes of underconsumption, lower prices alone may have little effect. Information campaigns, easier access to vaccination centres, or direct public provision may address these barriers more effectively.",
  "Overall, a subsidy is effective when price is the main barrier, but a combination of subsidies and information provision is likely to be more effective than a subsidy alone.",
].join("\n\n");

/**
 * True ONLY while both fields still hold the untouched sample text (modulo
 * surrounding whitespace). Any edit to either field returns false, and the
 * page then behaves exactly like a normal submission — no hidden magic where
 * edited work is still treated as a free sample.
 */
export function isUnmodifiedSample(question: string, answer: string): boolean {
  return question.trim() === SAMPLE_QUESTION && answer.trim() === SAMPLE_ANSWER;
}

/**
 * The fixed example result shown by "View sample feedback". A plain in-memory
 * object rendered by the existing presentation components; it is NEVER passed
 * to storage. `eligibleForCoreAnalytics: false` is stamped as defence in
 * depth: even if this object were ever (wrongly) fed into the insights maths,
 * the canonical eligibility check would exclude it from every core metric.
 */
export const SAMPLE_WALKTHROUGH_ATTEMPT: Attempt = {
  id: "sample-walkthrough",
  createdAt: "2026-01-01T09:00:00.000Z",
  subject: "Economics",
  topic: "Market failure and externalities",
  question: SAMPLE_QUESTION,
  answer: SAMPLE_ANSWER,
  parentAttemptId: null,
  practiceQuestionId: null,
  sourceMaterial: null,
  feedback: {
    score: 5, // internal 0–7 signal, never rendered
    band: "", // never rendered; real grades compute this server-side
    strengths: [
      "Accurate theory: positive consumption externalities and the gap between social and private benefit are used correctly to explain underconsumption.",
      "The subsidy mechanism is traced step by step — costs, supply, price, quantity — and applied with a relevant real-world example.",
      "Genuine evaluation: the answer tests when a subsidy works and weighs alternatives against the actual cause of underconsumption.",
    ],
    improvements: [
      "Name the welfare outcome explicitly — identify the gap between the market quantity and the social optimum that the subsidy narrows.",
      "Let the final judgement commit further: state which barrier is most plausible for vaccines and make the recommendation follow from it.",
      "Explaining a labelled MSB/MPB diagram in words would sharpen exactly how far the subsidy closes the welfare gap.",
    ],
    mistakes: [],
    examinerComment:
      "A well-organised response with secure understanding of externality theory, applied to a sensible real-world case. The analysis is clear, and the evaluation goes beyond listing alternatives by linking the policy choice to the cause of underconsumption. To reach the top of the range, push the analysis into explicit welfare terms and make the final judgement more decisive.",
    studyNext:
      "Practise closing 10-mark discussions with a one-sentence justified judgement: name the condition under which your recommendation holds, and commit to it.",
  },
  assessment: {
    version: ASSESSMENT_VERSION,
    assessmentFormat: "custom_extended_response",
    paper: "custom",
    questionPart: "unknown",
    levelRelevance: "shared_sl_hl",
    assessmentSkills: ["economic_analysis", "application", "evaluation"],
    commandTerm: "discuss",
    commandTermLabel: "Discuss",
    syllabusUnit: "unit_2",
    syllabusTopic: "2.6",
    topicLabel: "Market failure and externalities",
    classificationConfidence: "high",
    markingConfidence: "medium",
    marksAvailable: 10,
    marksAssessable: 10,
    marksEarned: 8,
    unassessedMarks: 0,
    marksSource: "explicit_in_question",
    markDisplayMode: "exact_estimate",
    evidenceSplitSource: "not_specified",
    unassessedEvidence: null,
    practiceLevelLow: 5,
    practiceLevelHigh: 6,
    practiceLevelConfidence: "medium",
    diagramExpected: false,
    diagramSubmitted: false,
    diagramAssessmentStatus: "not_relevant",
    workingsExpected: false,
    workingsSubmitted: false,
    workingsAssessmentStatus: "not_relevant",
    attachmentContent: "none",
    markBreakdown: [
      {
        label: "Knowledge and terminology",
        awarded: 2,
        available: 2,
        reason: "Externality terms are used precisely and the market failure is correctly identified.",
      },
      {
        label: "Economic analysis",
        awarded: 2,
        available: 3,
        reason:
          "The supply-shift chain is clear, but the welfare analysis stays implicit — the gap between market and optimal quantity is never named.",
      },
      {
        label: "Application to context",
        awarded: 2,
        available: 2,
        reason: "The influenza vaccination example is specific and genuinely supports the argument.",
      },
      {
        label: "Evaluation and judgment",
        awarded: 2,
        available: 3,
        reason:
          "Alternatives are weighed against the cause of the problem; the final judgement could be more decisive.",
      },
    ],
    limitations: [],
    // A bare [10] never claims an IB paper — same policy as a real grade.
    scoringState: "marked",
    markTotalSource: "explicit",
    recognizedTemplate: null,
    diagramAssessable: false,
    writtenMarksAwarded: 8,
    diagramMarksUnavailable: null,
    capReason: null,
    eligibleForCoreAnalytics: false, // example only — never student evidence
    framework: "generic_practice",
  },
};
