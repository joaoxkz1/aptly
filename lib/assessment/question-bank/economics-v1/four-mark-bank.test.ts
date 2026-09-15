import { describe, expect, it } from "vitest";
import { FOUR_MARK_QUESTIONS } from "./four-mark";
import { ECONOMICS_QUESTION_BANK } from "./index";
import { eligibleBankQuestions } from "./selection";
import { lexicalNearDuplicates, validateEconomicsQuestionBank } from "./validation";
import { DIAGRAM_FAMILIES } from "@/lib/assessment/diagram-contract";

describe("original four-mark launch bank", () => {
  it("ships 96 complete entries with the planned format, unit and eligibility counts", () => {
    expect(FOUR_MARK_QUESTIONS).toHaveLength(96);
    const counts = ["unit_1", "unit_2", "unit_3", "unit_4"].map(unit => {
      const entries = FOUR_MARK_QUESTIONS.filter(q => q.unit === unit);
      return {
        unit,
        diagram: entries.filter(q => q.gradingBlueprint.kind === "four_mark" && q.gradingBlueprint.format === "diagram_explanation").length,
        written: entries.filter(q => q.gradingBlueprint.kind === "four_mark" && q.gradingBlueprint.format === "written_explanation").length,
        hl: entries.filter(q => q.levelRelevance === "hl_only").length,
      };
    });
    expect(counts).toEqual([
      { unit: "unit_1", diagram: 6, written: 2, hl: 0 },
      { unit: "unit_2", diagram: 32, written: 4, hl: 12 },
      { unit: "unit_3", diagram: 24, written: 4, hl: 8 },
      { unit: "unit_4", diagram: 18, written: 6, hl: 4 },
    ]);
    expect(new Set(FOUR_MARK_QUESTIONS.map(q => q.id)).size).toBe(96);
    expect(validateEconomicsQuestionBank(ECONOMICS_QUESTION_BANK).errors).toEqual([]);
  });

  it("keeps genuinely tested HL outcomes out of SL selection", () => {
    const sl = [...new Set(FOUR_MARK_QUESTIONS.map(q => q.topicCode))].flatMap(topicCode =>
      eligibleBankQuestions(FOUR_MARK_QUESTIONS, { marks: 4, courseLevel: "sl", topicCode })
    );
    expect(sl).toHaveLength(72);
    expect(sl.every(q => q.levelRelevance === "shared_sl_hl")).toBe(true);
    expect(sl.filter(q => q.topicCode === "2.11")).toHaveLength(0);
    expect(sl.filter(q => q.gradingBlueprint.kind === "four_mark" && ["money_market", "phillips"].includes(q.gradingBlueprint.diagramCriteria?.family ?? ""))).toHaveLength(0);
    expect(sl.filter(q => q.gradingBlueprint.kind === "four_mark" && q.gradingBlueprint.diagramCriteria?.family === "lorenz")).toHaveLength(2);
    const globalHl = FOUR_MARK_QUESTIONS.filter(q => q.unit === "unit_4" && q.levelRelevance === "hl_only");
    expect(globalHl.map(q => q.topicCode).sort()).toEqual(["4.1", "4.1", "4.6", "4.6"]);
  });

  it("retains complete original stimulus and honest version/review provenance for saved questions", () => {
    for (const question of FOUR_MARK_QUESTIONS) {
      expect(question.marks).toBe(4);
      expect(question.sourceMaterial).toMatch(/^Hypothetical/);
      expect(question.sourceMaterial!.length).toBeGreaterThan(100);
      expect(question.paper).toBe("custom");
      expect(question.questionPart).toBe("unknown");
      expect(question.gradingBlueprintVersion).toBe("economics-four-mark-blueprint-v2");
      expect(question.targetSkills).not.toContain("evaluation");
      const blueprint = question.gradingBlueprint;
      if (blueprint.kind !== "four_mark") throw new Error(question.id);
      expect(blueprint.reviewProvenance).toMatchObject({ author: "Aptly", status: "source_reviewed" });
      expect(blueprint.reviewProvenance.basis.join(" ")).toContain("not an IB question");
      expect(JSON.parse(JSON.stringify(question))).toEqual(question);
    }
  });

  it("has task-specific partial-credit boundaries and family criteria without universal axes or areas", () => {
    const fullDiagramDescriptors = new Set<string>();
    const fullExplanationDescriptors = new Set<string>();
    for (const question of FOUR_MARK_QUESTIONS) {
      const bp = question.gradingBlueprint;
      if (bp.kind !== "four_mark") throw new Error(question.id);
      if (bp.format === "written_explanation") {
        expect(bp.diagramCriteria).toBeNull();
        expect(bp.writtenCriteria).toHaveLength(2);
        expect(bp.writtenCriteria.every(s => s.includes("0–2") && s.includes("0 =") && s.includes("1 =") && s.includes("2 ="))).toBe(true);
        continue;
      }
      const criteria = bp.diagramCriteria!;
      expect(DIAGRAM_FAMILIES).toContain(criteria.family);
      expect(criteria.contextConstraints).toContain(question.sourceMaterial);
      expect(criteria.rules).toContain("within_part_ecf");
      expect(criteria.rules).toContain("mechanism_consistency_2");
      for (const descriptor of [...Object.values(criteria.diagram), ...Object.values(criteria.explanation)]) {
        expect(descriptor.length).toBeGreaterThan(25);
        expect(descriptor).not.toMatch(/placeholder|TODO|correct diagram\.?$/i);
      }
      fullDiagramDescriptors.add(criteria.diagram.two);
      fullExplanationDescriptors.add(criteria.explanation.two);
      if (criteria.family === "poverty_cycle") {
        expect(criteria.labels.join(" ")).not.toMatch(/axis|price|quantity/i);
        expect(criteria.essentialAreas).toEqual([]);
      }
      if (criteria.rules.includes("question_label_ceiling_3")) expect(criteria.labelingRuleReason).toBeTruthy();
    }
    expect(fullDiagramDescriptors.size).toBe(80);
    expect(fullExplanationDescriptors.size).toBe(80);
  });

  it("keeps the drought fixture limited to supply and equilibrium and detects duplicate stems", () => {
    const drought = FOUR_MARK_QUESTIONS.find(q => q.id === "econ-v1-2.3-4-001")!;
    expect(drought.question).toContain("drought");
    const bp = drought.gradingBlueprint;
    if (bp.kind !== "four_mark") throw new Error("missing drought blueprint");
    expect(bp.diagramCriteria!.essentialAreas).toEqual([]);
    expect(bp.diagramCriteria!.relationships.join(" ")).toContain("D is unchanged");
    expect(bp.diagramCriteria!.outcomes.join(" ")).toMatch(/price rises.*quantity falls/);
    expect(bp.diagramCriteria!.explanation.two).not.toMatch(/evaluation|surplus area/i);
    expect(lexicalNearDuplicates(FOUR_MARK_QUESTIONS, 0.86)).toEqual([]);
    expect(lexicalNearDuplicates([drought, { ...drought, id: "synthetic-duplicate" }], 0.86)).toHaveLength(1);
  });
});
