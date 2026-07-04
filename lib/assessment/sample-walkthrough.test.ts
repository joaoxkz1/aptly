import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SAMPLE_ANSWER,
  SAMPLE_QUESTION,
  SAMPLE_WALKTHROUGH_ATTEMPT,
  isUnmodifiedSample,
} from "./sample-walkthrough";
import { runPreflight } from "./preflight";
import { deriveScoringState, isCoreEligible } from "./status";
import { buildLearningInsights, stateBreakdown } from "./readiness";

/**
 * "Use a sample answer" walkthrough — onboarding must be free and evidence-
 * neutral: the sample's [10] is auto-detected by the EXISTING preflight, the
 * fixed walkthrough never touches the grading route or storage, and the
 * example attempt can never count as student evidence even if mishandled.
 */

const WALKTHROUGH_COMPONENT = readFileSync(
  join("components", "submit", "sample-walkthrough.tsx"),
  "utf8"
);
const SAMPLE_MODULE = readFileSync(join("lib", "assessment", "sample-walkthrough.ts"), "utf8");
const SUBMIT_PAGE = readFileSync(join("app", "(app)", "submit", "page.tsx"), "utf8");

describe("sample question — existing mark-total detection", () => {
  it("carries a literal [10] the deterministic preflight recognises", () => {
    expect(SAMPLE_QUESTION).toContain("[10]");
    const pf = runPreflight(SAMPLE_QUESTION);
    expect(pf.kind).toBe("explicit");
    expect(pf.total).toBe(10);
    expect(pf.source).toBe("explicit");
    expect(pf.matchedText).toBe("[10]");
  });
});

describe("isUnmodifiedSample — edits leave the sample path", () => {
  it("is true only for the untouched sample text (whitespace-tolerant)", () => {
    expect(isUnmodifiedSample(SAMPLE_QUESTION, SAMPLE_ANSWER)).toBe(true);
    expect(isUnmodifiedSample(`  ${SAMPLE_QUESTION}\n`, `${SAMPLE_ANSWER}  `)).toBe(true);
  });

  it("is false the moment either field is edited — normal grading applies", () => {
    expect(isUnmodifiedSample(SAMPLE_QUESTION.replace("[10]", "[15]"), SAMPLE_ANSWER)).toBe(false);
    expect(isUnmodifiedSample(SAMPLE_QUESTION, `${SAMPLE_ANSWER} My own extra point.`)).toBe(false);
    expect(isUnmodifiedSample("", SAMPLE_ANSWER)).toBe(false);
    expect(isUnmodifiedSample(SAMPLE_QUESTION, "")).toBe(false);
  });
});

describe("walkthrough is static — no grading call, no persistence", () => {
  it("the walkthrough component never calls the grade route or any network", () => {
    expect(WALKTHROUGH_COMPONENT).not.toContain("/api/grade");
    expect(WALKTHROUGH_COMPONENT).not.toContain("fetch(");
  });

  it("the walkthrough component never imports storage or Supabase", () => {
    expect(WALKTHROUGH_COMPONENT).not.toContain("addAttempt");
    expect(WALKTHROUGH_COMPONENT).not.toContain("useAttempts");
    expect(WALKTHROUGH_COMPONENT).not.toContain("supabase");
  });

  it("the sample module is pure content — no network, no storage", () => {
    expect(SAMPLE_MODULE).not.toContain("fetch(");
    expect(SAMPLE_MODULE).not.toContain("supabase");
  });

  it("is labelled as an example, never a saved result", () => {
    expect(WALKTHROUGH_COMPONENT).toContain("Sample walkthrough");
    expect(WALKTHROUGH_COMPONENT).toContain(
      "This example is not saved or included in your progress."
    );
    expect(WALKTHROUGH_COMPONENT).toContain("Try your own answer");
  });
});

describe("submit page — sample paths gated on the untouched sample only", () => {
  it("offers View sample feedback strictly behind isUnmodifiedSample", () => {
    expect(SUBMIT_PAGE).toContain("View sample feedback");
    expect(SUBMIT_PAGE).toContain("isUnmodifiedSample(typedQuestion, answer)");
  });

  it("keeps exactly one grading fetch — the real route, unchanged", () => {
    expect(SUBMIT_PAGE.match(/fetch\("\/api\/grade"/g)).toHaveLength(1);
  });
});

describe("example attempt — excluded from student evidence by design", () => {
  it("renders as a marked example but is never core-eligible", () => {
    expect(deriveScoringState(SAMPLE_WALKTHROUGH_ATTEMPT)).toBe("marked");
    expect(SAMPLE_WALKTHROUGH_ATTEMPT.assessment?.eligibleForCoreAnalytics).toBe(false);
    expect(isCoreEligible(SAMPLE_WALKTHROUGH_ATTEMPT)).toBe(false);
  });

  it("contributes nothing to core insights even if (wrongly) fed in", () => {
    const insights = buildLearningInsights([SAMPLE_WALKTHROUGH_ATTEMPT]);
    expect(insights.markedCount).toBe(0);
    expect(insights.validCount).toBe(0);
    expect(insights.topicPerformance).toHaveLength(0);
    expect(insights.markTrend).toHaveLength(0);
    expect(insights.nextFocus).toBeNull();
    expect(insights.level.state).toBe("building_baseline");
    expect(stateBreakdown([SAMPLE_WALKTHROUGH_ATTEMPT]).confirmed).toBe(0);
  });
});
