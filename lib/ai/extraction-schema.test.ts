import { describe, expect, it } from "vitest";
import { MAX_ANSWER_CHARS, MAX_QUESTION_CHARS } from "./config";
import {
  EXTRACTION_JSON_SCHEMA,
  buildExtractionInstructions,
  hasExtractedContent,
  validateExtractionResult,
} from "./extraction-schema";

const QUESTION = "Explain how a price ceiling affects the market for rental housing. [10]";
const ANSWER = "A binding price ceiling below equilibrium creates excess demand and a shortage.";
const SOURCE =
  "Average rents in Norvia rose 14% in 2024 while the vacancy rate fell to 1.2%, prompting a rent cap.";

describe("EXTRACTION_JSON_SCHEMA — transcription fields only", () => {
  it("permits exactly question/answer/sourceMaterial, all nullable, nothing extra", () => {
    expect(EXTRACTION_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(Object.keys(EXTRACTION_JSON_SCHEMA.properties)).toEqual([
      "question",
      "answer",
      "sourceMaterial",
    ]);
    expect(EXTRACTION_JSON_SCHEMA.required).toEqual(["question", "answer", "sourceMaterial"]);
    for (const prop of Object.values(EXTRACTION_JSON_SCHEMA.properties)) {
      expect(prop.type).toEqual(["string", "null"]);
    }
  });
});

describe("buildExtractionInstructions — transcription, never judgement", () => {
  it("forbids invention, correction, classification, and diagram description", () => {
    const text = buildExtractionInstructions();
    expect(text).toContain("Never guess, infer, or invent");
    expect(text).toContain("Never rewrite, improve, summarise, correct");
    expect(text).toContain("Do not classify the paper");
    expect(text).toContain("Do not judge correctness");
    expect(text).toContain("hand-drawn diagram is not text");
    expect(text).toContain("student names");
  });

  it("contains no marking vocabulary that could invite a grade", () => {
    const lower = buildExtractionInstructions().toLowerCase();
    expect(lower).not.toContain("markband");
    expect(lower).not.toContain("rubric");
    expect(lower).not.toContain("award");
  });
});

describe("validateExtractionResult — fail closed", () => {
  it("accepts the exact approved shape and normalises whitespace", () => {
    const result = validateExtractionResult({
      question: `  ${QUESTION}  `,
      answer: ANSWER,
      sourceMaterial: SOURCE,
    });
    expect(result).toEqual({ question: QUESTION, answer: ANSWER, sourceMaterial: SOURCE });
  });

  it("accepts all-null output (the unreadable page shape)", () => {
    const result = validateExtractionResult({ question: null, answer: null, sourceMaterial: null });
    expect(hasExtractedContent(result)).toBe(false);
  });

  it("rejects non-object output", () => {
    for (const bad of [null, "text", 12, [QUESTION], undefined]) {
      expect(() => validateExtractionResult(bad)).toThrow(/^invalid extraction result: shape$/);
    }
  });

  it("rejects any unexpected field — marks, Paper labels, feedback, metadata", () => {
    const base = { question: QUESTION, answer: ANSWER, sourceMaterial: null };
    for (const extra of [
      { marks: 7 },
      { markTotal: 15 },
      { paper: "Paper 2" },
      { framework: "paper2g_15_mark" },
      { feedback: "Well argued." },
      { confidence: 0.9 },
      { diagram: "supply and demand" },
    ]) {
      expect(() => validateExtractionResult({ ...base, ...extra })).toThrow(
        /^invalid extraction result: unexpected field$/
      );
    }
  });

  it("rejects missing or wrongly typed approved fields, naming only the field", () => {
    expect(() => validateExtractionResult({ question: QUESTION, answer: ANSWER })).toThrow(
      /^invalid extraction result: sourceMaterial$/
    );
    expect(() =>
      validateExtractionResult({ question: 15, answer: ANSWER, sourceMaterial: null })
    ).toThrow(/^invalid extraction result: question$/);
    expect(() =>
      validateExtractionResult({ question: QUESTION, answer: ["a"], sourceMaterial: null })
    ).toThrow(/^invalid extraction result: answer$/);
  });

  it("empty and whitespace-only strings become null", () => {
    const result = validateExtractionResult({ question: "", answer: "  \n ", sourceMaterial: null });
    expect(result).toEqual({ question: null, answer: null, sourceMaterial: null });
  });

  it("clamps over-limit transcriptions to the grading field caps", () => {
    const result = validateExtractionResult({
      question: "q".repeat(MAX_QUESTION_CHARS + 500),
      answer: "a".repeat(MAX_ANSWER_CHARS + 500),
      sourceMaterial: null,
    });
    expect(result.question).toHaveLength(MAX_QUESTION_CHARS);
    expect(result.answer).toHaveLength(MAX_ANSWER_CHARS);
  });

  it("a fragment that fails the usable-source floor is never offered as source", () => {
    for (const junk of ["Figure 1", "See chart", "GDP 2024", "a b c d"]) {
      const result = validateExtractionResult({
        question: QUESTION,
        answer: null,
        sourceMaterial: junk,
      });
      expect(result.sourceMaterial).toBeNull();
    }
    // Real stimulus text passes through untouched.
    const ok = validateExtractionResult({ question: null, answer: null, sourceMaterial: SOURCE });
    expect(ok.sourceMaterial).toBe(SOURCE);
  });
});
