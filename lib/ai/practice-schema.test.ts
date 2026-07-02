import { describe, expect, it } from "vitest";
import {
  buildPracticeInstructions,
  buildPracticeUserInput,
  validateGeneratedPractice,
} from "./practice-schema";
import type { PracticeTarget } from "@/lib/assessment/practice-target";

function target(overrides: Partial<PracticeTarget> = {}): PracticeTarget {
  return {
    topicCode: "2.6",
    topicLabel: "Market Failure & Externalities",
    focusSkillLabel: "Evaluation and judgment",
    skill: "evaluation",
    framework: "generic_practice",
    markTotal: 15,
    requiresSource: false,
    why: "Evidence-backed reason.",
    reliability: "reliable_pattern",
    confidenceTier: "Developing priority",
    ...overrides,
  };
}

const GOOD_QUESTION =
  "Discuss whether indirect taxation is the most effective response to the overconsumption of sugary drinks. [15 marks]";

const GOOD_SOURCE =
  "The fictional republic of Norvia has seen sugary-drink consumption rise 18% since 2021, with related healthcare costs reaching $340 million last year. " +
  "In March 2025 the government introduced a 25% excise tax on high-sugar beverages; early data show purchases falling 9% among low-income households but only 2% among high-income households. " +
  "Producers responded by cutting average sugar content 12%, while retailers report cross-border shopping in neighbouring Delmar rose 30%. " +
  "The finance ministry claims the tax raised $85 million for health programmes, but a producers' association argues 1,200 jobs are at risk and that voluntary reformulation agreements would achieve similar results at lower cost.";

describe("validateGeneratedPractice — fail-closed frame enforcement", () => {
  it("accepts a well-formed non-source question", () => {
    const out = validateGeneratedPractice(
      { question: GOOD_QUESTION, sourceMaterial: null },
      target()
    );
    expect(out.question).toBe(GOOD_QUESTION);
    expect(out.sourceMaterial).toBeNull();
  });

  it("requires the EXACT explicit mark total, exactly once", () => {
    // Missing total.
    expect(() =>
      validateGeneratedPractice(
        { question: "Discuss whether indirect taxation works best here.", sourceMaterial: null },
        target()
      )
    ).toThrow();
    // Wrong total.
    expect(() =>
      validateGeneratedPractice(
        { question: GOOD_QUESTION.replace("[15 marks]", "[10 marks]"), sourceMaterial: null },
        target()
      )
    ).toThrow();
    // Multiple conflicting totals.
    expect(() =>
      validateGeneratedPractice(
        { question: `${GOOD_QUESTION} Also worth 10 marks.`, sourceMaterial: null },
        target()
      )
    ).toThrow();
  });

  it("rejects any question relying on diagrams, tables, or unseen visuals", () => {
    for (const bad of [
      "Using a supply and demand diagram, explain the effect of the tax. [15 marks]",
      "Draw the market for sugary drinks and explain the shift. [15 marks]",
      "With reference to the table below, discuss the policy. [15 marks]",
      "Referring to the chart, discuss the intervention. [15 marks]",
    ]) {
      expect(() =>
        validateGeneratedPractice({ question: bad, sourceMaterial: null }, target())
      ).toThrow();
    }
  });

  it("rejects any claim of official IB / past-paper provenance", () => {
    for (const bad of [
      "This official past-paper question asks you to discuss the tax. [15 marks]",
      "From an IB exam: discuss whether the tax is effective. [15 marks]",
      "Paper 1 style: discuss whether the tax is effective. [15 marks]",
    ]) {
      expect(() =>
        validateGeneratedPractice({ question: bad, sourceMaterial: null }, target())
      ).toThrow();
    }
  });

  it("never lets a generated question match the 4-mark diagram template", () => {
    expect(() =>
      validateGeneratedPractice(
        {
          question: "Using a demand and supply diagram, explain a price floor. [4 marks]",
          sourceMaterial: null,
        },
        target({ markTotal: 4, framework: "paper2_short_analytic" })
      )
    ).toThrow();
  });

  it("requires a usable original source for source-dependent frameworks", () => {
    const t = target({
      framework: "paper2g_15_mark",
      requiresSource: true,
      skill: "data_interpretation",
    });
    const q =
      "Using information from the text and your knowledge of economics, discuss whether the excise tax benefits Norvia. [15 marks]";

    // Valid source passes and is preserved.
    const out = validateGeneratedPractice({ question: q, sourceMaterial: GOOD_SOURCE }, t);
    expect(out.sourceMaterial).toBe(GOOD_SOURCE);

    // Missing source fails.
    expect(() => validateGeneratedPractice({ question: q, sourceMaterial: null }, t)).toThrow();
    // Too-short source fails.
    expect(() =>
      validateGeneratedPractice({ question: q, sourceMaterial: "Tax rose. Sales fell." }, t)
    ).toThrow();
    // A source without usable figures fails.
    const noFigures = Array(40).fill("the economy changed and policy responded").join(" ");
    expect(() =>
      validateGeneratedPractice({ question: q, sourceMaterial: noFigures }, t)
    ).toThrow();
  });

  it("drops any stray source for non-source frameworks (never stored)", () => {
    const out = validateGeneratedPractice(
      { question: GOOD_QUESTION, sourceMaterial: GOOD_SOURCE },
      target()
    );
    expect(out.sourceMaterial).toBeNull();
  });

  it("rejects malformed shapes outright", () => {
    expect(() => validateGeneratedPractice(null, target())).toThrow();
    expect(() => validateGeneratedPractice("text", target())).toThrow();
    expect(() => validateGeneratedPractice({ sourceMaterial: null }, target())).toThrow();
    expect(() => validateGeneratedPractice({ question: "", sourceMaterial: null }, target())).toThrow();
  });
});

describe("practice generation prompt — frame comes from the server target", () => {
  it("instructions demand originality and forbid official-IB claims and diagrams", () => {
    const instructions = buildPracticeInstructions();
    expect(instructions).toContain("original");
    expect(instructions).toContain("Never mention the IB");
    expect(instructions.toLowerCase()).toContain("diagram");
  });

  it("user input pins the topic, skill, framework brief, and total", () => {
    const input = buildPracticeUserInput(
      target({ framework: "paper2g_15_mark", requiresSource: true, markTotal: 15 })
    );
    expect(input).toContain("2.6");
    expect(input).toContain("Mark total: 15");
    expect(input).toContain("[15 marks]");
    expect(input).toContain("YES — write the original stimulus");
  });
});
