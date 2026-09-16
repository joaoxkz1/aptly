import { describe, expect, it } from "vitest";
import { requestFingerprint } from "@/lib/ai/request-integrity";
import { DIAGRAM_CONTRACT_VERSION, DIAGRAM_FAMILIES } from "./diagram-contract";
import { enforceRevisionSourceGate, policyForGeneratedPractice, resolveScoringPolicy } from "./policy";
import { publicContract, policyWithContract, resolveAssessmentContract } from "./trusted-contract";
import { ECONOMICS_QUESTION_BANK } from "./question-bank/economics-v1";
import { ESSAY_DIAGRAM_AUDIT } from "./question-bank/economics-v1/essay-diagram-audit";
import type { EconomicsBankQuestion, ExtendedGradingBlueprint } from "./question-bank/economics-v1/types";

// Synthetic engineering checks. No provider calls or teacher-calibrated marks.
const emptyChoice = { requestedSource: null, requestedTotal: null, requestedFramework: null, templateId: null, sourceMaterial: null } as const;
const source = "Text A reports that energy costs rose while household spending and productive capacity remained unchanged.";
const essays = ECONOMICS_QUESTION_BANK.filter(q => q.marks === 10 || q.marks === 15);
const diagramFour = ECONOMICS_QUESTION_BANK.find(q => q.gradingBlueprint.kind === "four_mark" && q.gradingBlueprint.format === "diagram_explanation")!;
const writtenFour = ECONOMICS_QUESTION_BANK.find(q => q.gradingBlueprint.kind === "four_mark" && q.gradingBlueprint.format === "written_explanation")!;
function bankEntry(id: string) {
  const found = ECONOMICS_QUESTION_BANK.find(q => q.id === id);
  if (!found) throw new Error(`Missing test bank entry: ${id}`);
  return found;
}
function bankPolicy(q: EconomicsBankQuestion) {
  return policyForGeneratedPractice({ framework: q.framework, markTotal: q.marks, sourceMaterial: q.sourceMaterial ?? null });
}
function auditedInput(q: EconomicsBankQuestion) {
  if (q.gradingBlueprint.kind !== "extended") throw new Error("Expected essay fixture");
  return { policy: bankPolicy(q), question: q.question, topic: q.topicCode, sourceMaterial: q.sourceMaterial ?? null,
    blueprint: { ...q.gradingBlueprint, diagramRequirement: ESSAY_DIAGRAM_AUDIT[q.id] } as ExtendedGradingBlueprint,
    blueprintVersion: "economics-essay-blueprint-v2", level: q.levelRelevance };
}
function manual(question: string, policy = resolveScoringPolicy(question, emptyChoice), sourceMaterial: string | null = null) {
  return resolveAssessmentContract({ policy, question, topic: "unknown", sourceMaterial });
}

describe("trusted assessment definition before student evidence", () => {
  it("does not invent a contract for feedback-only or an unknown total", () => {
    expect(manual("Explain the effect of a subsidy." )).toBeNull();
    const q = "Using a demand and supply diagram, explain a subsidy. [4 marks]";
    expect(manual(q, resolveScoringPolicy(q, { ...emptyChoice, requestedSource: "feedback_only" }))).toBeNull();
  });

  it("preserves a two-mark definition even when it names a diagram family", () => {
    const q = "Define negative production externality. [2 marks]";
    const policy = resolveScoringPolicy(q, emptyChoice);
    const contract = manual(q, policy)!;
    expect(contract).toMatchObject({ mode: "not_assessed", diagramRole: "not_assessed", total: 2, diagram: null });
    expect(policyWithContract(policy, contract)).toMatchObject({ total: 2, assessable: 2, cappedDiagramMarks: 0, markingMethod: policy.markingMethod });
  });

  it("uses an inferred 2+2 practice contract for a recognized manual diagram task", () => {
    const q = "Using a demand and supply diagram, explain the effect of a producer subsidy. [4 marks]";
    const policy = resolveScoringPolicy(q, emptyChoice);
    const contract = manual(q, policy)!;
    expect(contract).toMatchObject({ version: DIAGRAM_CONTRACT_VERSION, mode: "four_mark_diagram", diagramRole: "required_explicitly",
      provenance: "inferred_practice", blueprintVersion: "inferred-question-contract-v2", total: 4, level: "unknown", scope: "same_question_part" });
    expect(contract.diagram?.family).toBe("demand_supply");
    expect(contract.diagram?.rules).toEqual(["within_part_ecf", "mechanism_consistency_2", "question_label_ceiling_3"]);
    expect(policyWithContract(policy, contract)).toMatchObject({ scoringState: "provisional", assessable: 4, cappedDiagramMarks: 0, capReason: null });
  });

  it("does not accept an unsupported model as an inferred four-mark diagram family", () => {
    const q = "Using a diagram, explain the proposed mechanism. [4 marks]";
    expect(() => manual(q)).toThrow("diagram_family_unsupported");
  });

  it("uses private authored four-mark criteria without claiming a past-paper part", () => {
    const before = structuredClone(diagramFour);
    const policy = bankPolicy(diagramFour);
    const contract = resolveAssessmentContract({ policy, question: diagramFour.question, topic: diagramFour.topicCode,
      sourceMaterial: diagramFour.sourceMaterial ?? null, blueprint: diagramFour.gradingBlueprint,
      blueprintVersion: diagramFour.gradingBlueprintVersion, level: diagramFour.levelRelevance })!;
    expect(contract).toMatchObject({ mode: "four_mark_diagram", provenance: "aptly_authored", paper: null, part: null,
      blueprintVersion: "economics-four-mark-blueprint-v2", level: "shared_sl_hl", total: 4 });
    if (diagramFour.gradingBlueprint.kind !== "four_mark") throw new Error("Expected four-mark fixture");
    expect(contract.diagram).toEqual(diagramFour.gradingBlueprint.diagramCriteria);
    expect(policyWithContract(policy, contract).scoringState).toBe("marked");
    expect(diagramFour).toEqual(before);
  });

  it("keeps authored written four-mark questions separate from diagram components", () => {
    const contract = resolveAssessmentContract({ policy: bankPolicy(writtenFour), question: writtenFour.question, topic: writtenFour.topicCode,
      sourceMaterial: writtenFour.sourceMaterial ?? null, blueprint: writtenFour.gradingBlueprint })!;
    expect(contract).toMatchObject({ mode: "four_mark_written", diagramRole: "not_assessed", diagram: null, total: 4, provenance: "aptly_authored" });
    if (writtenFour.gradingBlueprint.kind !== "four_mark") throw new Error("Expected four-mark fixture");
    expect(contract.writtenCriteria).toEqual(writtenFour.gradingBlueprint.writtenCriteria);
    expect(policyWithContract(bankPolicy(writtenFour), contract).markingMethod).toBe("analytic");
  });

  it("does not impose a diagram or evaluation allocation on a manual written four-mark task", () => {
    const contract = manual("Explain two limitations of real GDP per capita as a development measure. [4 marks]")!;
    expect(contract).toMatchObject({ mode: "four_mark_written", diagramRole: "not_assessed", diagram: null, provenance: "inferred_practice" });
    expect(contract.writtenCriteria.join(" ")).toContain("No universal four-mark essay rubric");
  });

  it("recognizes explicit essay instructions without creating a fixed mark allocation", () => {
    const q = "Using an AD/AS diagram, explain how falling confidence changes real output. [10 marks]";
    const p = policyForGeneratedPractice({ framework: "paper1a_10_mark", markTotal: 10, sourceMaterial: null });
    const contract = manual(q, p)!;
    expect(contract).toMatchObject({ mode: "holistic_diagram", diagramRole: "required_explicitly", paper: "1", part: "a" });
    expect(policyWithContract(p, contract)).toMatchObject({ bestFit: true, assessable: 10, cappedDiagramMarks: 0 });
  });

  it("distinguishes a necessary economic relationship from an unresolved broad argument", () => {
    expect(manual("Explain how an indirect tax changes equilibrium price and quantity. [10 marks]")?.diagramRole).toBe("necessary_for_task");
    expect(manual("Evaluate the usefulness of economic models in decision making. [15 marks]")?.diagramRole).toBe("unresolved");
  });

  it("projects only safe pre-submission fields to the browser", () => {
    const contract = resolveAssessmentContract(auditedInput(bankEntry("econ-v1-2.3-10-001")))!;
    expect(Object.keys(publicContract(contract)).sort()).toEqual(["diagramReason", "diagramRole", "mode", "provenance", "version"]);
    expect(publicContract(contract)).not.toHaveProperty("diagram");
    expect(publicContract(contract)).not.toHaveProperty("writtenCriteria");
  });
});

describe("the semantic audit is applied per essay, including preserved historical inputs", () => {
  it("covers exactly the 211 existing essay IDs with valid, public-safe requirements", () => {
    expect(essays).toHaveLength(211);
    expect(Object.keys(ESSAY_DIAGRAM_AUDIT).sort()).toEqual(essays.map(q => q.id).sort());
    for (const q of essays) {
      const entry = ESSAY_DIAGRAM_AUDIT[q.id];
      expect(["necessary_for_task", "optional_appropriate"]).toContain(entry.role);
      if (entry.family !== null) expect(DIAGRAM_FAMILIES).toContain(entry.family);
      if (entry.role === "necessary_for_task") expect(entry.family).not.toBeNull();
      expect(entry.reason.length).toBeGreaterThan(20);
      expect(entry.reason).not.toMatch(/marks?\s*(?:awarded|deducted)|model answer|private blueprint/i);
    }
  });

  it("resolves all stored authored essay requirements without altering the original bank", () => {
    const before = structuredClone(essays);
    for (const q of essays) {
      const contract = resolveAssessmentContract(auditedInput(q))!;
      const required = ESSAY_DIAGRAM_AUDIT[q.id];
      expect(contract, q.id).toMatchObject({ diagramRole: required.role, diagramReason: required.reason,
        provenance: "aptly_authored", blueprintVersion: "economics-essay-blueprint-v2", total: q.marks,
        level: q.levelRelevance, syllabusVersion: "economics-2022-v1", topic: q.topicCode,
        paper: "1", part: q.marks === 10 ? "a" : "b" });
      expect(contract.diagram?.family ?? null, q.id).toBe(required.family);
      const policy = policyWithContract(bankPolicy(q), contract);
      expect(policy).toMatchObject({ bestFit: true, assessable: q.marks, cappedDiagramMarks: 0, capReason: null });
    }
    expect(essays).toEqual(before);
  });

  it.each([
    ["econ-v1-2.3-10-001", "necessary_for_task", "demand_supply"],
    ["econ-v1-2.11-10-002", "necessary_for_task", "cost_revenue"],
    ["econ-v1-3.2-10-001", "necessary_for_task", "ad_as"],
    ["econ-v1-3.6-10-001", "necessary_for_task", "ad_as"],
    ["econ-v1-4.1-10-001", "optional_appropriate", "ppc"],
    ["econ-v1-4.4-10-001", "necessary_for_task", "trade"],
    ["econ-v1-4.2-10-003", "necessary_for_task", "trade"],
    ["econ-v1-4.5-10-002", "necessary_for_task", "ad_as"],
    ["econ-v1-4.3-10-001", "optional_appropriate", "trade"],
    ["econ-v1-2.11-10-003", "optional_appropriate", null],
    ["econ-v1-2.11-15-003", "optional_appropriate", null],
  ] as const)("keeps the reviewed semantic correction for %s", (id, role, family) => {
    const contract = resolveAssessmentContract(auditedInput(bankEntry(id)))!;
    expect(contract.diagramRole).toBe(role);
    expect(contract.diagram?.family ?? null).toBe(family);
  });

  it("treats an optional saved requirement as authoritative even when generic keywords suggest necessity", () => {
    const input = auditedInput(bankEntry("econ-v1-4.3-10-001"));
    expect(resolveAssessmentContract(input)?.diagramRole).toBe("optional_appropriate");
    expect(resolveAssessmentContract({ ...input, blueprint: null, blueprintVersion: undefined })?.provenance).toBe("inferred_practice");
  });

  it("retains a frozen saved requirement rather than consulting mutable future assessment guidance", () => {
    const input = auditedInput(bankEntry("econ-v1-2.3-10-001"));
    const first = resolveAssessmentContract(input)!;
    const stored = JSON.parse(JSON.stringify(input));
    input.blueprint.diagramRequirement = { role: "optional_appropriate", family: null, reason: "Synthetic changed guidance for a later authoring version." };
    input.blueprintVersion = "economics-essay-blueprint-v-next";
    expect(resolveAssessmentContract(stored)).toEqual(first);
    expect(resolveAssessmentContract(input)?.diagramRole).toBe("optional_appropriate");
  });

  it("resolves a trusted historical bank ID through the audit without modifying its old blueprint", () => {
    const q = bankEntry("econ-v1-2.3-10-001");
    const before = structuredClone(q);
    const contract = resolveAssessmentContract({ policy: bankPolicy(q), question: q.question, topic: q.topicCode,
      sourceMaterial: null, blueprint: q.gradingBlueprint, blueprintVersion: q.gradingBlueprintVersion,
      bankQuestionId: q.id, level: q.levelRelevance })!;
    expect(contract).toMatchObject({ diagramRole: "necessary_for_task", provenance: "aptly_authored",
      blueprintVersion: q.gradingBlueprintVersion, diagramReason: ESSAY_DIAGRAM_AUDIT[q.id].reason });
    expect(contract.diagram?.family).toBe("demand_supply");
    expect(q).toEqual(before);
  });

  it("prefers the frozen saved requirement over the historical bank-ID fallback", () => {
    const q = bankEntry("econ-v1-2.3-10-001");
    const input = auditedInput(q);
    input.blueprint.diagramRequirement = { role: "optional_appropriate", family: null, reason: "A reviewed saved variant has no prescribed graphical construction." };
    const contract = resolveAssessmentContract({ ...input, bankQuestionId: q.id })!;
    expect(contract).toMatchObject({ diagramRole: "optional_appropriate", diagram: null, diagramReason: input.blueprint.diagramRequirement.reason });
  });

  it("does not replace an authored null family with a keyword model", () => {
    const input = auditedInput(bankEntry("econ-v1-2.11-10-002"));
    input.question = "Evaluate the role of monopoly regulation in achieving wider social goals. [15 marks]";
    input.policy = policyForGeneratedPractice({ framework: "paper1b_15_mark", markTotal: 15, sourceMaterial: null });
    input.blueprint.diagramRequirement = { role: "optional_appropriate", family: null, reason: "This reviewed variant leaves the model choice to the argument selected." };
    expect(resolveAssessmentContract(input)).toMatchObject({ diagramRole: "optional_appropriate", diagram: null });
  });

  it("does not invent authored audit provenance for an unknown historical ID", () => {
    const q = "Evaluate the usefulness of economic models. [15 marks]";
    const contract = resolveAssessmentContract({ policy: resolveScoringPolicy(q, emptyChoice), question: q,
      topic: "1.2", sourceMaterial: null, bankQuestionId: "econ-v1-missing-15-999" })!;
    expect(contract.provenance).toBe("inferred_practice");
  });
});

describe("stimulus and framework scope", () => {
  it.each([null, "", "   ", "Text A", "Table 1", "A verylongplaceholderreferencewithnorealdata"]) ("rejects unusable referenced source %j before assessment", missing => {
    const q = "Using an AD/AS diagram, explain the effect described in Text A. [4 marks]";
    expect(() => manual(q, resolveScoringPolicy(q, emptyChoice), missing)).toThrow("contract_context_required");
  });

  it("binds an explicit source requirement once usable context is supplied", () => {
    const q = "Using an AD/AS diagram, explain the effect described in Text A. [4 marks]";
    const contract = manual(q, resolveScoringPolicy(q, emptyChoice), source)!;
    expect(contract.sourceRequired).toBe(true);
    expect(contract.diagram?.contextConstraints.join(" ")).toContain("Do not invent missing stimulus");
  });

  it.each(["paper2g_15_mark", "paper3b_10_mark"] as const)("retains the missing-source gate for %s even on a revision with a new total", framework => {
    const total = framework === "paper2g_15_mark" ? 15 : 10;
    const noSource = policyForGeneratedPractice({ framework, markTotal: total, sourceMaterial: null });
    expect(manual("Evaluate the policy response.", noSource)).toBeNull();
    const generic = resolveScoringPolicy("Evaluate the policy response.", { ...emptyChoice, requestedSource: "user_confirmed", requestedTotal: total });
    const revised = enforceRevisionSourceGate(generic, framework, "Text A");
    expect(revised).toMatchObject({ framework, scoringState: "feedback_only", total: null });
    expect(manual("Evaluate the policy response.", revised)).toBeNull();
  });

  it("does not infer a mandatory-diagram gate for Paper 2(g)'s highest level", () => {
    const q = "Evaluate the effect of a tariff on economic welfare. [15 marks]";
    const p = policyForGeneratedPractice({ framework: "paper2g_15_mark", markTotal: 15, sourceMaterial: source });
    const contract = manual(q, p, source)!;
    expect(contract).toMatchObject({ diagramRole: "optional_appropriate", paper: "2", part: "g", total: 15, sourceRequired: true });
    expect(contract.diagramReason).toContain("highest level can be reached without diagrams");
    expect(policyWithContract(p, contract)).toMatchObject({ assessable: 15, bestFit: true, cappedDiagramMarks: 0 });
  });

  it("keeps the Paper 2(g) exemption when a trusted general essay requirement would otherwise be necessary", () => {
    const input = auditedInput(bankEntry("econ-v1-4.2-10-003"));
    input.policy = policyForGeneratedPractice({ framework: "paper2g_15_mark", markTotal: 15, sourceMaterial: source });
    input.sourceMaterial = source;
    const contract = resolveAssessmentContract(input)!;
    expect(contract.diagramRole).toBe("optional_appropriate");
    expect(contract.diagramReason).toContain("highest level can be reached without diagrams");
  });

  it("records the source-dependent Paper 3(b) framework without an invented four-mark split", () => {
    const policy = policyForGeneratedPractice({ framework: "paper3b_10_mark", markTotal: 10, sourceMaterial: source });
    const contract = manual("Recommend a policy response to the described economy. [10 marks]", policy, source)!;
    expect(contract).toMatchObject({ framework: "paper3b_10_mark", paper: "3", part: "b", total: 10,
      mode: "holistic_diagram", sourceRequired: true });
  });

  it("records HL from trusted metadata without using an essay diagram family as the level gate", () => {
    const q = bankEntry("econ-v1-2.11-10-002");
    expect(resolveAssessmentContract(auditedInput(q))).toMatchObject({ level: "hl_only", syllabusVersion: "economics-2022-v1" });
    const shared = bankEntry("econ-v1-2.3-10-001");
    expect(resolveAssessmentContract(auditedInput(shared))?.level).toBe("shared_sl_hl");
  });
});

describe("immutable snapshot inputs", () => {
  it("binds contract content and its authoring version separately from student answer content", () => {
    const input = auditedInput(bankEntry("econ-v1-2.3-10-001"));
    const contract = resolveAssessmentContract(input)!;
    const baseline = { contractHash: requestFingerprint(contract), contextHash: requestFingerprint(source),
      questionHash: requestFingerprint(input.question), answerHash: requestFingerprint("First written answer") };
    const revised = { ...baseline, answerHash: requestFingerprint("Different written answer") };
    expect(revised.contractHash).toBe(baseline.contractHash);
    expect(revised.answerHash).not.toBe(baseline.answerHash);
    expect(requestFingerprint(revised)).not.toBe(requestFingerprint(baseline));
    expect(requestFingerprint({ ...contract, blueprintVersion: "economics-essay-blueprint-v-next" })).not.toBe(baseline.contractHash);
    expect(requestFingerprint({ ...contract, diagramReason: "Changed assessment definition" })).not.toBe(baseline.contractHash);
  });

  it("makes an altered stimulus a different binding even when the answer and image stay the same", () => {
    const common = { answerHash: requestFingerprint("Same answer"), attachments: [{ contentHash: "a".repeat(64), role: "student_diagram" }] };
    expect(requestFingerprint({ ...common, contextHash: requestFingerprint(source) }))
      .not.toBe(requestFingerprint({ ...common, contextHash: requestFingerprint("Text A now reports rising household demand and unchanged energy costs.") }));
  });
});
