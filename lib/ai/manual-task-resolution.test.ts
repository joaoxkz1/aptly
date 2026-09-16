import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyManualTaskInterpretation, interpretManualTask, needsManualTaskInterpretation, validateManualTaskInterpretation } from "./manual-task-resolution";
import { resolveScoringPolicy } from "@/lib/assessment/policy";
import { policyWithContract, resolveAssessmentContract } from "@/lib/assessment/trusted-contract";
import { REVIEWED_TASK_RULES } from "@/lib/assessment/examiner-task-registry";
const create = vi.hoisted(() => vi.fn());
vi.mock("./openai", () => ({ getOpenAI: () => ({ responses: { create } }) }));
const question = "Explain how close substitutes and adjustment time influence price elasticity of demand. [10]";
const policy = resolveScoringPolicy(question, { requestedFramework: "paper1a_10_mark", requestedSource: null, requestedTotal: null, templateId: null, sourceMaterial: null });
const contract = resolveAssessmentContract({ policy, question, topic: "2.5", sourceMaterial: null })!;
const interpretation = { confidence: "high", coverage: "complete", matches: [{ ruleId: "elasticity-determinants", demandQuote: "close substitutes and adjustment time", mechanism: "Substitution opportunities and time to adjust determine quantity responsiveness to a price change." }], uncertainty: null };
beforeEach(() => vi.clearAllMocks());
describe("bounded manual task interpretation", () => {
  it("resolves a familiar PED determinant task from an unresolved contract, without topic authority", () => {
    expect(needsManualTaskInterpretation(contract)).toBe(true);
    const resolved = applyManualTaskInterpretation(contract, interpretation, question);
    expect(resolved).toMatchObject({ diagramRole: "appropriate_support", diagram: null, essayResolution: { confidence: "mechanism_matched", method: "constrained_interpretation", registryVersion: "ib-task-families-2026-v1" } });
    expect(policyWithContract(policy, resolved).scoringState).toBe("marked");
    expect(contract.diagramRole).toBe("unresolved");
  });
  it.each(REVIEWED_TASK_RULES)("maps $id through server-owned policy, not model-selected roles", rule => {
    const result = applyManualTaskInterpretation(contract, { ...interpretation, matches: [{ ...interpretation.matches[0], ruleId: rule.id }] }, question);
    expect(result.diagramRole).toBe(rule.role);
    expect(result.essayResolution?.basis).toContain(rule.sources[0]);
  });
  it("retains multiple task families and uses the necessary demand when a mixed question requires it", () => {
    const result = applyManualTaskInterpretation(contract, { ...interpretation, matches: [...interpretation.matches, { ...interpretation.matches[0], ruleId: "externality-allocation" }] }, question);
    expect(result.diagramRole).toBe("necessary_for_task");
    expect(result.essayResolution?.families).toEqual(["demand_supply", "externality"]);
    expect(result.diagram).toBeNull(); // no arbitrary single-family substitution
  });
  it("keeps incomplete coverage provisional, never optional by default", () => {
    const result = applyManualTaskInterpretation(contract, { confidence: "uncertain", coverage: "partial", matches: [], uncertainty: "The requested second mechanism is not specified." }, question);
    expect(result.diagramRole).toBe("unresolved");
    expect(policyWithContract(policy, result).scoringState).toBe("provisional");
  });
  it("accepts outer citation punctuation without allowing a non-verbatim demand", () => {
    const quoted = { ...interpretation, matches: [{ ...interpretation.matches[0], demandQuote: "“close substitutes and adjustment time”" }] };
    expect(validateManualTaskInterpretation(quoted, question).confidence).toBe("high");
    expect(validateManualTaskInterpretation({ ...quoted, matches: [{ ...quoted.matches[0], demandQuote: `“${question}”` }] }, question).confidence).toBe("high");
    expect(() => validateManualTaskInterpretation({ ...quoted, matches: [{ ...quoted.matches[0], demandQuote: "“close substitutes and welfare”" }] }, question)).toThrow();
  });
  it.each([
    { ...interpretation, diagramRole: "optional" },
    { ...interpretation, coverage: "partial" },
    { ...interpretation, uncertainty: "unsure" },
    { ...interpretation, matches: [] },
    { ...interpretation, matches: [{ ...interpretation.matches[0], ruleId: "invented-policy" }] },
    { ...interpretation, matches: [{ ...interpretation.matches[0], demandQuote: "This quote is not in the question" }] },
    { ...interpretation, matches: [{ ...interpretation.matches[0], role: "optional" }] },
  ])("rejects invalid authority/evidence %j", raw => {
    expect(() => validateManualTaskInterpretation(raw, question)).toThrow();
  });
  it("never overrides trusted contracts, other frameworks or explicit non-graphical conflicts", () => {
    for (const c of [{ ...contract, diagramRole: "necessary_for_task" as const }, { ...contract, framework: "paper2g_15_mark" as const }, { ...contract, essayResolution: { ...contract.essayResolution!, ruleId: "non-graphical-or-conflicting-instruction" } }]) {
      expect(needsManualTaskInterpretation(c)).toBe(false);
      expect(applyManualTaskInterpretation(c, { malicious: true }, question)).toBe(c);
    }
  });
  it("requires reservation, sends only task evidence with strict schema, and disables retries", async () => {
    await expect(interpretManualTask({ contract, question, source: null, signal: new AbortController().signal, reservationId: "" })).rejects.toThrow("reservation");
    expect(create).not.toHaveBeenCalled();
    create.mockResolvedValue({ status: "completed", output_text: JSON.stringify(interpretation) });
    await interpretManualTask({ contract, question, source: null, signal: new AbortController().signal, reservationId: "reserved" });
    const [payload, options] = create.mock.calls[0];
    expect(payload.text.format).toMatchObject({ strict: true, name: "aptly_manual_task_interpretation" });
    expect(Object.keys(JSON.parse(payload.input[1].content))).toEqual(["question", "source", "framework", "total"]);
    expect(payload.store).toBe(false); expect(options.maxRetries).toBe(0);
  });
});
