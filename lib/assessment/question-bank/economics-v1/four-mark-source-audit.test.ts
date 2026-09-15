import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FOUR_MARK_QUESTIONS } from "./four-mark";

function entry(id: string) {
  const question = FOUR_MARK_QUESTIONS.find(item => item.id === `econ-v1-${id}`);
  if (!question || question.gradingBlueprint.kind !== "four_mark") throw new Error(id);
  return { question, blueprint: question.gradingBlueprint };
}

describe("source-closed original four-mark content", () => {
  it("resolves every private review reference to its own substantive audit record", () => {
    const audit = readFileSync(resolve("docs/four-mark-source-audit.md"), "utf8");
    expect([...audit.matchAll(/<a id="econ-v1-[^"]+"><\/a>/g)]).toHaveLength(96);
    for (const question of FOUR_MARK_QUESTIONS) {
      if (question.gradingBlueprint.kind !== "four_mark") throw new Error(question.id);
      expect(audit).toContain(`<a id="${question.id}"></a>`);
      expect(question.gradingBlueprint.reviewProvenance.reviewReference).toBe(`docs/four-mark-source-audit.md#${question.id}`);
    }
  });

  it("aligns the specified PPC, medicine and tariff demands with their private criteria", () => {
    expect(entry("1.1-4-002").question.question).toContain("both food and clothing");
    const medicine = entry("2.5-4-003");
    expect(medicine.question.question).toContain("lack of close substitutes");
    expect(medicine.question.question).toContain("small share of income");
    expect(medicine.blueprint.writtenCriteria[1]).toContain("income-share");
    expect(entry("4.2-4-001").question.sourceMaterial).toContain("imports remain positive");
  });

  it("does not accept a different mechanism or AS assumption as an equivalent answer", () => {
    const currency = entry("4.5-4-003").blueprint.diagramCriteria!;
    expect(currency.acceptableAlternatives.join(" ")).not.toContain("resident-retention");
    expect(currency.acceptableAlternatives.join(" ")).toContain("supply unchanged");
    expect(entry("3.5-4-001").blueprint.diagramCriteria!.acceptableAlternatives.join(" ")).toContain("upward-sloping relevant segment");
    expect(entry("3.6-4-003").blueprint.diagramCriteria!.acceptableAlternatives.join(" ")).toContain("cannot replace the requested money-market diagram");
  });

  it("keeps the equality diagonal geometrically relevant without inventing an essential text label", () => {
    for (const id of ["3.4-4-001", "3.4-4-002"]) {
      const criteria = entry(id).blueprint.diagramCriteria!;
      expect(criteria.labels.some(label => /^Equality/i.test(label))).toBe(false);
      expect(criteria.acceptableAlternatives.join(" ")).toMatch(/diagonal.*need not be labeled/);
      expect(criteria.rules).toContain("question_label_ceiling_3");
    }
  });

  it("makes attempt 05's outcome-only partial boundary explicit without awarding full causal credit", () => {
    const explanation = entry("2.3-4-001").blueprint.diagramCriteria!.explanation;
    expect(explanation.one).toContain("identifies at least one correct relevant equilibrium outcome");
    expect(explanation.one).toContain("without a developed causal chain");
    expect(explanation.two).toContain("smaller harvest reduces wheat supply at each price");
    expect(explanation.two).toContain("raises the equilibrium price and lowers quantity traded");
    expect(explanation.two).toContain("word shortage is not required");
    const audit = readFileSync(resolve("docs/four-mark-source-audit.md"), "utf8");
    expect(audit).toContain("**3/4 is valid**; 4/4 is not");
    expect(audit).toContain("does not itself prescribe a wheat mark");
  });
});
