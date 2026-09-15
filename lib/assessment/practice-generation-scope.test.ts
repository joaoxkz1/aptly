import { describe, expect, it } from "vitest";
import { getPracticeAo3Scope, PRACTICE_AO3_SCOPES } from "./practice-generation-scope";
import { SYLLABUS_TOPICS } from "./taxonomy";
import { resolveQuestionGeneratorTarget } from "./question-generator";

describe("adaptive 15-mark AO3 scope", () => {
  it("accounts for all current topics and rejects unrecognized identifiers", () => {
    expect(Object.keys(PRACTICE_AO3_SCOPES).sort()).toEqual(SYLLABUS_TOPICS.filter(topic => topic !== "unknown").sort());
    for (const topic of ["unknown", "legacy", "2.13", "__proto__", "constructor"]) {
      expect(getPracticeAo3Scope(topic, "hl")).toBeNull();
    }
  });

  it.each(["1.1", "1.2", "2.1", "2.2"])("blocks foundational %s fallback at both levels without blocking target resolution", topicCode => {
    for (const courseLevel of ["sl", "hl"] as const) {
      expect(getPracticeAo3Scope(topicCode, courseLevel)).toBeNull();
      expect(resolveQuestionGeneratorTarget({ topicCode, courseLevel, marks: 15, attempts: [], requestCurrentFocus: false }))
        .toMatchObject({ topicCode, markTotal: 15 });
    }
  });

  it("treats persistent balance-of-payments evaluation as HL while preserving its shared lower-format target", () => {
    expect(getPracticeAo3Scope("4.6", "sl")).toBeNull();
    expect(getPracticeAo3Scope("4.6", "hl")).toMatchObject({ levelRelevance: "hl_only", hint: expect.stringContaining("persistent current-account") });
    expect(resolveQuestionGeneratorTarget({ topicCode: "4.6", courseLevel: "sl", marks: 10, attempts: [], requestCurrentFocus: false }))
      .toMatchObject({ levelRelevance: "shared_sl_hl", markTotal: 10 });
  });

  it.each(["2.4", "2.10", "2.11", "2.12"])("preserves the full-topic HL restriction for %s", topicCode => {
    expect(getPracticeAo3Scope(topicCode, "sl")).toBeNull();
    expect(getPracticeAo3Scope(topicCode, "hl")?.levelRelevance).toBe("hl_only");
  });

  it("uses explicit policy intersections for AO2-only concepts", () => {
    expect(getPracticeAo3Scope("2.6", "sl")).toMatchObject({ kind: "cross", hint: expect.stringContaining("2.7 policy") });
    expect(getPracticeAo3Scope("4.7", "sl")).toMatchObject({ kind: "cross", hint: expect.stringContaining("3.3 growth") });
    expect(getPracticeAo3Scope("2.5", "sl")).toMatchObject({ kind: "direct", hint: expect.stringContaining("PED") });
  });

  it("keeps mixed-topic fallback inside the selected shared scope even for HL students", () => {
    for (const topic of ["2.5", "3.3", "3.5", "3.6", "4.1", "4.4", "4.5"]) {
      expect(getPracticeAo3Scope(topic, "hl")).toEqual(getPracticeAo3Scope(topic, "sl"));
      expect(getPracticeAo3Scope(topic, "hl")?.levelRelevance).toBe("shared_sl_hl");
    }
  });
});
