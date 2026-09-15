import { describe, expect, it } from "vitest";
import {
  ECONOMICS_QUESTION_BANK,
  questionBankCoverage,
} from "./index";
import { lexicalNearDuplicates, validateEconomicsQuestionBank } from "./validation";
import { eligibleBankQuestions, selectCuratedQuestion } from "./selection";
import { SYLLABUS_TOPICS } from "@/lib/assessment/taxonomy";
import type { EconomicsBankQuestion } from "./types";

describe("economics-question-bank-v1", () => {
  it("contains a large valid original bank with stable unique content", () => {
    const report = validateEconomicsQuestionBank(ECONOMICS_QUESTION_BANK);
    expect(report.errors).toEqual([]);
    expect(report.valid).toBe(true);
    expect(ECONOMICS_QUESTION_BANK).toHaveLength(398);
    expect(new Set(ECONOMICS_QUESTION_BANK.map((question) => question.id)).size).toBe(398);
    expect(
      new Set(
        ECONOMICS_QUESTION_BANK.map((question) =>
          question.question.toLowerCase().replace(/\s+/g, " ").trim()
        )
      ).size
    ).toBe(398);
  });

  it("covers every current topic with the planned mark and level distribution", () => {
    const coverage = questionBankCoverage();
    expect(coverage.map((row) => row.topicCode)).toEqual(
      SYLLABUS_TOPICS.filter((topic) => topic !== "unknown")
    );
    expect(
      ECONOMICS_QUESTION_BANK.filter((question) => question.marks === 2)
    ).toHaveLength(91);
    expect(
      ECONOMICS_QUESTION_BANK.filter((question) => question.marks === 10)
    ).toHaveLength(91);
    expect(
      ECONOMICS_QUESTION_BANK.filter((question) => question.marks === 15)
    ).toHaveLength(120);
    expect(
      ECONOMICS_QUESTION_BANK.filter((question) => question.levelRelevance === "hl_only" && question.marks !== 4)
    ).toHaveLength(63);
  });

  it("keeps hidden blueprint guidance on every entry without fake submarks", () => {
    for (const question of ECONOMICS_QUESTION_BANK.filter(q => q.marks !== 4)) {
      expect(question.gradingBlueprint).toBeTruthy();
      expect(JSON.stringify(question.gradingBlueprint)).not.toMatch(
        /(?:allocate|award)\s+\d+\s+marks?/i
      );
      expect(question.diagramPolicy).toContain("not required");
    }
  });

  it("runs lexical near-duplicate QA without any suspicious stem pairs", () => {
    expect(lexicalNearDuplicates(ECONOMICS_QUESTION_BANK, 0.86)).toEqual([]);
  });
});

describe("curated-bank selection", () => {
  it("enforces topic, marks and SL eligibility", () => {
    expect(
      eligibleBankQuestions(ECONOMICS_QUESTION_BANK, {
        marks: 15,
        topicCode: "3.5",
        courseLevel: "sl",
      })
    ).toHaveLength(3);
    expect(
      eligibleBankQuestions(ECONOMICS_QUESTION_BANK, {
        marks: 15,
        topicCode: "3.5",
        courseLevel: "hl",
      })
    ).toHaveLength(4);
    expect(
      eligibleBankQuestions(ECONOMICS_QUESTION_BANK, {
        marks: 15,
        topicCode: "2.10",
        courseLevel: "sl",
      })
    ).toHaveLength(0);
    expect(
      eligibleBankQuestions(ECONOMICS_QUESTION_BANK, {
        marks: 15,
        topicCode: "2.10",
        courseLevel: "hl",
      })
    ).toHaveLength(4);
  });

  it("prefers unseen questions, avoids immediate repeats and signals exhaustion", () => {
    const target = { marks: 15 as const, topicCode: "3.5", courseLevel: "sl" as const };
    const first = selectCuratedQuestion(ECONOMICS_QUESTION_BANK, target, [], "first");
    expect(first).not.toBeNull();
    const second = selectCuratedQuestion(
      ECONOMICS_QUESTION_BANK,
      target,
      [{ bankQuestionId: first!.id, createdAt: "2026-08-18T00:00:00Z" }],
      "second"
    );
    expect(second?.id).not.toBe(first?.id);
    const allSeen = eligibleBankQuestions(ECONOMICS_QUESTION_BANK, target).map(
      (question) => ({ bankQuestionId: question.id, createdAt: "2026-08-18T00:00:00Z" })
    );
    expect(selectCuratedQuestion(ECONOMICS_QUESTION_BANK, target, allSeen, "done")).toBeNull();
  });

  it("never returns a wrong-topic or wrong-mark entry", () => {
    const selected = selectCuratedQuestion(
      ECONOMICS_QUESTION_BANK,
      { marks: 10, topicCode: "4.5", courseLevel: "hl", targetSkill: "economic_analysis" },
      [],
      "targeted"
    );
    expect(selected).toMatchObject({ marks: 10, topicCode: "4.5" });
  });

  it("prefers an unseen question tagged for the trusted Current Focus skill", () => {
    const source = eligibleBankQuestions(ECONOMICS_QUESTION_BANK, {
      marks: 15,
      topicCode: "3.5",
      courseLevel: "hl",
    });
    const candidates: EconomicsBankQuestion[] = [
      { ...source[0], targetSkills: ["economic_analysis"] },
      { ...source[1], targetSkills: ["evaluation"] },
    ];
    expect(
      selectCuratedQuestion(
        candidates,
        {
          marks: 15,
          topicCode: "3.5",
          courseLevel: "hl",
          targetSkill: "evaluation",
        },
        [],
        "current-focus"
      )?.id
    ).toBe(candidates[1].id);
  });
});
