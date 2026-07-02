import { describe, expect, it } from "vitest";
import {
  applyExtractionToFields,
  canFillFromScan,
  fillsAnything,
  type SubmitFieldState,
} from "./apply-extraction";

/**
 * The non-negotiable fill-only-empty-fields rule: extraction may fill only
 * genuinely empty fields; typed content is never overwritten, merged, or
 * replaced — however partial it is and however complete the image looks.
 */

const EXTRACTED = {
  question: "Explain how a subsidy affects the market for vaccines. [4]",
  answer: "A subsidy shifts supply right, lowering price and raising quantity.",
  sourceMaterial:
    "In 2024 Norvia spent $40 million subsidising vaccines; uptake rose 12% among low-income households.",
};

const EMPTY: SubmitFieldState = { question: "", answer: "", stagedSource: null };

describe("applyExtractionToFields — empty fields fill", () => {
  it("fills an empty question, answer, and source staging", () => {
    expect(applyExtractionToFields(EMPTY, EXTRACTED)).toEqual({
      question: EXTRACTED.question,
      answer: EXTRACTED.answer,
      stagedSource: EXTRACTED.sourceMaterial,
    });
  });

  it("fills only the empty answer when the question is already typed (typed question + photo of answer)", () => {
    const fill = applyExtractionToFields(
      { question: "My own typed question. [10]", answer: "", stagedSource: null },
      EXTRACTED
    );
    expect(fill.question).toBeNull(); // typed question untouched
    expect(fill.answer).toBe(EXTRACTED.answer);
  });

  it("null extraction fields fill nothing", () => {
    const fill = applyExtractionToFields(EMPTY, {
      question: null,
      answer: null,
      sourceMaterial: null,
    });
    expect(fillsAnything(fill)).toBe(false);
  });
});

describe("applyExtractionToFields — typed content is untouchable", () => {
  it("never overwrites a non-empty typed question", () => {
    const fill = applyExtractionToFields({ ...EMPTY, question: "Typed question" }, EXTRACTED);
    expect(fill.question).toBeNull();
  });

  it("never overwrites a non-empty typed answer", () => {
    const fill = applyExtractionToFields({ ...EMPTY, answer: "Typed answer" }, EXTRACTED);
    expect(fill.answer).toBeNull();
  });

  it("never overwrites non-empty staged source", () => {
    const fill = applyExtractionToFields({ ...EMPTY, stagedSource: "Typed source" }, EXTRACTED);
    expect(fill.stagedSource).toBeNull();
  });

  it("PARTIAL typed content is never merged or replaced — even a single character", () => {
    const partial: SubmitFieldState = {
      question: "Expl", // student started typing the same question
      answer: "A subsidy", // partial overlap with the extraction
      stagedSource: "In 2024",
    };
    const fill = applyExtractionToFields(partial, EXTRACTED);
    expect(fill).toEqual({ question: null, answer: null, stagedSource: null });
  });

  it("whitespace-only fields count as empty (nothing real to protect)", () => {
    const fill = applyExtractionToFields(
      { question: "   ", answer: "\n", stagedSource: "  " },
      EXTRACTED
    );
    expect(fill.question).toBe(EXTRACTED.question);
    expect(fill.answer).toBe(EXTRACTED.answer);
    expect(fill.stagedSource).toBe(EXTRACTED.sourceMaterial);
  });
});

describe("canFillFromScan — pre-upload gate", () => {
  it("allows a scan while either text field is empty", () => {
    expect(canFillFromScan({ question: "", answer: "" })).toBe(true);
    expect(canFillFromScan({ question: "Typed", answer: "" })).toBe(true);
    expect(canFillFromScan({ question: "", answer: "Typed" })).toBe(true);
  });

  it("blocks a scan (and its paid extraction) when both fields already have text", () => {
    expect(canFillFromScan({ question: "Typed", answer: "Typed" })).toBe(false);
  });
});
