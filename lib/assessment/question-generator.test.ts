import { describe, expect, it } from "vitest";
import {
  isCurrentGeneratorTopic,
  isGeneratorMarkTotal,
  resolveQuestionGeneratorTarget,
} from "./question-generator";

describe("question-generator trusted target", () => {
  it("accepts only V1 marks and current non-legacy topics", () => {
    expect([2, 10, 15].every(isGeneratorMarkTotal)).toBe(true);
    expect(isGeneratorMarkTotal(4)).toBe(false);
    expect(isCurrentGeneratorTopic("3.5")).toBe(true);
    expect(isCurrentGeneratorTopic("unknown")).toBe(false);
    expect(isCurrentGeneratorTopic("legacy-3.5")).toBe(false);
  });

  it("maps marks to the fixed reliable V1 frameworks", () => {
    expect(
      resolveQuestionGeneratorTarget({
        marks: 2,
        topicCode: "3.5",
        courseLevel: "sl",
        attempts: [],
        requestCurrentFocus: false,
      }).framework
    ).toBe("paper2_short_analytic");
    expect(
      resolveQuestionGeneratorTarget({
        marks: 10,
        topicCode: "3.5",
        courseLevel: "sl",
        attempts: [],
        requestCurrentFocus: false,
      }).framework
    ).toBe("paper1a_10_mark");
    expect(
      resolveQuestionGeneratorTarget({
        marks: 15,
        topicCode: "3.5",
        courseLevel: "sl",
        attempts: [],
        requestCurrentFocus: false,
      }).framework
    ).toBe("paper1b_15_mark");
  });

  it("blocks HL-only top-level topics for SL and permits them for HL", () => {
    for (const topicCode of ["2.4", "2.10"]) {
      expect(() =>
        resolveQuestionGeneratorTarget({
          marks: 10,
          topicCode,
          courseLevel: "sl",
          attempts: [],
          requestCurrentFocus: false,
        })
      ).toThrow("HL-only");
      expect(
        resolveQuestionGeneratorTarget({
          marks: 10,
          topicCode,
          courseLevel: "hl",
          attempts: [],
          requestCurrentFocus: false,
        }).levelRelevance
      ).toBe("hl_only");
    }
  });

  it("does not claim Current Focus without matching saved evidence", () => {
    expect(
      resolveQuestionGeneratorTarget({
        marks: 15,
        topicCode: "3.5",
        courseLevel: "hl",
        attempts: [],
        requestCurrentFocus: true,
      }).fromCurrentFocus
    ).toBe(false);
  });
});
